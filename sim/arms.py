"""Two arms, mirrored on the cabinet's side walls, and their ready pose.

Per arm, base to tip: fixed base box -> shoulder yaw (z) -> upper link 0.35 (hinge y) -> elbow (y)
-> forearm 0.30 -> wrist (y) -> palm + two fingers on slide joints (opening 0.06 m, along the hand's swing axis so they stay clear of the wall).
Hinge convention: a link hangs along -z at q = 0 and swings toward +x (forward) for negative q.
The arms do not collide with anything yet (contype 0); contact comes with the grasp in 2.2.
"""
import math

import numpy as np

SIDES = {"l": (0.15, 90.0), "r": (1.05, 90.0)}   # shoulder x, heading of local +x (deg): both reach forward (+y); mirrored about x = 0.60
SHOULDER_Y, SHOULDER_Z = -0.10, 0.95             # forward of the back wall, so the grasp targets are off the yaw singularity
L1, L2, TOOL = 0.35, 0.30, 0.06                  # upper link, forearm, wrist -> pinch point
HOVER = 0.05                                     # ready pose: pinch point this far above the corner
ARMATURE = 0.02                                  # reflected inertia; keeps kv stable at dt = 0.004 with Euler
KP, KV, KV_SLIDE = 40, 1.5, 1.0
GRIP_OPEN = 0.03                                 # each finger; two fingers -> 0.06 m opening
RANGES = {"shoulder": (-2.7, 2.7), "upper": (-2.4, 1.0), "elbow": (-0.3, 2.8), "wrist": (-2.2, 2.2),
          "grip": (0.0, GRIP_OPEN)}
HINGES = ("shoulder", "upper", "elbow", "wrist")
GEOM = 'contype="0" conaffinity="0"'
PAD = 'contype="1" conaffinity="1" condim="6" friction="1.2 0.02 0.001"'   # task 2.5: contact finger pads


def _arm(side, pads=False):
    pad = PAD if pads else GEOM
    x, heading = SIDES[side]
    n = f"arm_{side}"
    j = f'armature="{ARMATURE}"'
    r = {k: tuple(round(math.degrees(v), 3) for v in RANGES[k]) for k in HINGES}  # MJCF angles are degrees
    return f"""
    <body name="{n}_base" pos="{x} {SHOULDER_Y} {SHOULDER_Z}" euler="0 0 {heading}">
      <geom name="{n}_base_box" type="box" pos="0 0 -0.05" size="0.03 0.03 0.05" rgba="0.35 0.35 0.38 1" {GEOM}/>
      <body name="{n}_yaw_body">
        <joint name="{n}_shoulder" type="hinge" axis="0 0 1" range="{r['shoulder'][0]} {r['shoulder'][1]}" {j}/>
        <geom name="{n}_housing" type="cylinder" size="0.025 0.012" rgba="0.35 0.35 0.38 1" {GEOM}/>
        <body name="{n}_upper_body">
          <joint name="{n}_upper" type="hinge" axis="0 1 0" range="{r['upper'][0]} {r['upper'][1]}" {j}/>
          <geom name="{n}_upper_link" type="box" pos="0 0 -{L1 / 2}" size="0.015 0.015 {L1 / 2}" rgba="0.9 0.55 0.1 1" {GEOM}/>
          <body name="{n}_fore_body" pos="0 0 -{L1}">
            <joint name="{n}_elbow" type="hinge" axis="0 1 0" range="{r['elbow'][0]} {r['elbow'][1]}" {j}/>
            <geom name="{n}_forearm" type="box" pos="0 0 -{L2 / 2}" size="0.0125 0.0125 {L2 / 2}" rgba="0.9 0.55 0.1 1" {GEOM}/>
            <body name="{n}_hand" pos="0 0 -{L2}">
              <joint name="{n}_wrist" type="hinge" axis="0 1 0" range="{r['wrist'][0]} {r['wrist'][1]}" {j}/>
              <geom name="{n}_palm" type="box" pos="0 0 -0.01" size="0.025 0.02 0.01" rgba="0.2 0.2 0.22 1" {GEOM}/>
              <site name="{n}_pinch" pos="0 0 -{TOOL}" size="0.006" rgba="1 0 0 1"/>
              <body name="{n}_finger_a" pos="0.005 0 -0.045">
                <joint name="{n}_grip" type="slide" axis="1 0 0" range="0 {GRIP_OPEN}" {j}/>
                <geom name="{n}_finger_a" type="box" size="0.005 0.02 0.025" rgba="0.2 0.2 0.22 1" {pad}/>
              </body>
              <body name="{n}_finger_b" pos="-0.005 0 -0.045">
                <joint name="{n}_grip2" type="slide" axis="-1 0 0" range="0 {GRIP_OPEN}" {j}/>
                <geom name="{n}_finger_b" type="box" size="0.005 0.02 0.025" rgba="0.2 0.2 0.22 1" {pad}/>
              </body>
            </body>
          </body>
        </body>
      </body>
    </body>"""


def worldbody_xml(pads=False):
    return "".join(_arm(s, pads) for s in SIDES)


def actuator_xml(grip_kp=None):
    rows = []
    for s in SIDES:
        for k in (*HINGES, "grip"):
            lo, hi = RANGES[k]
            kv = KV_SLIDE if k == "grip" else KV
            rows.append(f'<position name="arm_{s}_{k}" joint="arm_{s}_{k}" kp="{grip_kp if (k == "grip" and grip_kp) else KP}" kv="{kv}" '
                        f'ctrlrange="{lo} {hi}"/>')
    return "<actuator>\n    " + "\n    ".join(rows) + "\n  </actuator>"


def equality_xml():
    rows = [f'<joint joint1="arm_{s}_grip2" joint2="arm_{s}_grip" polycoef="0 1 0 0 0"/>' for s in SIDES]
    return "<equality>\n    " + "\n    ".join(rows) + "\n  </equality>"


def _wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


def ik(side, target):
    """Planar 2-link IK, closed form. Tool points straight down, so the wrist sits TOOL above the target.
    Returns {joint: angle}. Of the two elbow branches the one with the higher elbow is taken."""
    x, heading = SIDES[side]
    dx, dy = target[0] - x, target[1] - SHOULDER_Y
    psi = _wrap(math.atan2(dy, dx) - math.radians(heading))
    r = math.hypot(dx, dy)
    drop = SHOULDER_Z - (target[2] + TOOL)                    # wrist below the shoulder
    dist = math.hypot(r, drop)
    if not abs(L1 - L2) < dist < L1 + L2:
        raise ValueError(f"arm {side}: target {np.round(target, 3)} at distance {dist:.3f} is out of reach")
    phi = math.atan2(-r, drop)                                # direction of shoulder -> wrist, from -z toward +x
    c2 = (dist**2 - L1**2 - L2**2) / (2 * L1 * L2)
    best = None
    for q2 in (math.acos(c2), -math.acos(c2)):
        q1 = phi - math.atan2(L2 * math.sin(q2), L1 + L2 * math.cos(q2))
        elbow_z = -L1 * math.cos(q1)
        if best is None or elbow_z > best[0]:
            best = (elbow_z, q1, q2)
    _, q1, q2 = best
    q = {"shoulder": psi, "upper": q1, "elbow": q2, "wrist": -(q1 + q2)}
    for k, v in q.items():
        lo, hi = RANGES[k]
        if not lo <= v <= hi:
            raise ValueError(f"arm {side}: {k} = {v:.3f} outside [{lo}, {hi}]")
    return q


def corners(model, data, kind="towel"):
    """World positions of the two pin corners (left, right) of the garment, as currently simulated."""
    import scene  # late: scene imports this module
    pos = np.array(data.flexvert_xpos)
    out = []
    for xy in scene.corners_xy(kind):
        i = int(np.argmin((pos[:, 0] - xy[0]) ** 2 + (pos[:, 1] - xy[1]) ** 2))
        out.append(pos[i].copy())
    return out


def ready_pose(model, data, kind="towel", cs=None):
    """Hand-free ready pose by IK: pinch points HOVER above the two corners, fingers open.
    cs: optional perceived corners (left, right); default is the fixed lay-down corners.
    Returns ({actuator: ctrl}, [corner_l, corner_r])."""
    if cs is None:
        cs = corners(model, data, kind)
    ctrl = {}
    for side, c in zip(SIDES, cs):
        for k, v in ik(side, c + np.array([0, 0, HOVER])).items():
            ctrl[f"arm_{side}_{k}"] = v
        ctrl[f"arm_{side}_grip"] = GRIP_OPEN
    return ctrl, cs


def apply(model, data, ctrl):
    for name, v in ctrl.items():
        data.ctrl[model.actuator(name).id] = v


def pinch(model, data, side):
    return np.array(data.site_xpos[model.site(f"arm_{side}_pinch").id])
