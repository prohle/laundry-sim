"""Cabinet, shelf, garment, cameras, lights -> MJCF string.

Cabinet: x 0..1.20, y -0.35..0.45 (back wall at -y, open front at +y), z 0..1.40.
Shelf top at z = 0.70. Garment is generated in XZ and rotated flat onto the shelf.
"""
import math
import os

import arms
import garment as G

W, D, H, T = 1.20, 0.80, 1.40, 0.02
Y0 = -0.35                      # back of the cabinet
CX, CY = W / 2, Y0 + D / 2      # shelf centre (0.60, 0.05)
SHELF_Z, SHELF_T = 0.70, 0.02   # the folding board (task 7.1): top at z = 0.71
BOARD_C = (0.60, 0.05, 0.71)    # board centre on its top surface
CY_B = BOARD_C[1]
BW, BD = 0.80 / 3, 0.70 / 3     # centre panel 0.267 x 0.233; tri-fold board 0.80 x 0.70 in all
HINGE_Z = 0.715                 # hinge axis 5 mm above the board top: a flap at 180 deg lies at z 0.72-0.74, over the cloth stack
CAMERAS = {  # name: (position, target, fovy)
    "inside": ((0.60, 1.30, 1.05), (0.60, 0.05, 0.75), 45),
    "top": ((0.60, 0.05, 1.55), BOARD_C, 55),
    "side_l": ((0.05, 0.05, 0.95), BOARD_C, 60),
    "side_r": ((1.15, 0.05, 0.95), BOARD_C, 60),
    "front": ((0.60, 0.95, 0.95), BOARD_C, 50),
}
# flap name: (hinge point on the board top, unit vector from hinge over the flap, hinge axis, size across, size along the hinge)
# Coplanar with the centre panel at rest. A positive angle lifts the flap and folds it 180 deg inward over the centre.
# front is at +y (the open side, the `front` camera); back is at -y.
FLAPS = {
    "left": ((CX - BW / 2, CY_B), (-1, 0), "0 1 0", BW, BD),
    "right": ((CX + BW / 2, CY_B), (1, 0), "0 -1 0", BW, BD),
    "front": ((CX, CY_B + BD / 2), (0, 1), "1 0 0", BD, 3 * BW),
    "back": ((CX, CY_B - BD / 2), (0, -1), "-1 0 0", BD, 3 * BW),
}
FLAP_KP, FLAP_KV = 300, 5
BAR_Y = (-0.20, 0.30)


def board_xml():
    """Tri-fold board: a centre panel and four coplanar flaps, hinged 15 mm above the top surface, plus the smoothing bar."""
    z, th = BOARD_C[2], SHELF_T
    rgba = "0.55 0.40 0.28 1"
    fr = 'contype="1" conaffinity="1" friction="0.8 0.02 0.001"'
    out = [f'<body name="board" pos="{BOARD_C[0]} {BOARD_C[1]} {z - th / 2}">'
           f'<geom name="board" type="box" size="{BW / 2} {BD / 2} {th / 2}" rgba="{rgba}" {fr}/></body>']
    for n, ((hx, hy), (ux, uy), axis, across, along) in FLAPS.items():
        sx, sy = (across, along) if ux else (along, across)
        out.append(
            f'<body name="flap_{n}" pos="{hx:.5f} {hy:.5f} {HINGE_Z}">'
            f'<joint name="hinge_{n}" type="hinge" axis="{axis}" range="0 180" damping="{FLAP_KV}"/>'
            f'<geom name="flap_{n}" type="box" pos="{ux * across / 2:.5f} {uy * across / 2:.5f} {z - th / 2 - HINGE_Z:.5f}" '
            f'size="{sx / 2:.5f} {sy / 2:.5f} {th / 2}" density="300" rgba="0.85 0.70 0.35 1" {fr}/></body>')
    out.append(
        f'<body name="bar" pos="{BOARD_C[0]} {BAR_Y[0]} 0.745">'
        f'<joint name="bar_y" type="slide" axis="0 1 0" range="0 {BAR_Y[1] - BAR_Y[0]}" damping="{FLAP_KV}"/>'
        f'<geom name="bar" type="box" size="0.35 0.02 0.02" mass="0.2" rgba="0.3 0.3 0.35 1" contype="0" conaffinity="0"/></body>')
    return "\n    ".join(out)


def drive_flap(model, data, name, angle_deg, ramp=200, hold=200):
    """Ramp a flap to angle_deg over `ramp` steps, hold `hold` steps. Returns the final hinge angle in degrees."""
    import mujoco
    import numpy as np
    act, goal = model.actuator(f"act_hinge_{name}").id, math.radians(angle_deg)
    for i in range(ramp + hold):
        data.ctrl[act] = goal * min(1.0, (i + 1) / ramp)
        mujoco.mj_step(model, data)
    return float(np.degrees(data.joint(f"hinge_{name}").qpos[0]))


def board_contact_xml():
    """Flaps may not collide with the board or each other (they sweep through its edge); the cloth still meets them."""
    names = ["board"] + [f"flap_{n}" for n in FLAPS]
    pairs = [(a, b) for i, a in enumerate(names) for b in names[i + 1:]]
    return "<contact>" + "".join(f'<exclude body1="{a}" body2="{b}"/>' for a, b in pairs) + "</contact>"


def board_actuator_xml():
    rows = [f'<position name="act_hinge_{n}" joint="hinge_{n}" kp="{FLAP_KP}" ctrlrange="0 {math.pi:.5f}"/>' for n in FLAPS]
    rows.append(f'<position name="act_bar_y" joint="bar_y" kp="2000" ctrlrange="0 {BAR_Y[1] - BAR_Y[0]}"/>')
    return "<actuator>" + "".join(rows) + "</actuator>"


def _sub(a, b): return tuple(x - y for x, y in zip(a, b))
def _norm(a):
    n = math.sqrt(sum(x * x for x in a))
    return tuple(x / n for x in a)
def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def xyaxes(pos, target):
    """Camera x (right) and y (up) axes for a camera at pos looking at target, world up = +z.
    For a straight-down camera the world up is replaced by +y."""
    f = _norm(_sub(target, pos))
    up = (0, 1, 0) if abs(f[2]) > 0.999 else (0, 0, 1)
    r = _norm(_cross(f, up))
    u = _cross(r, f)
    return " ".join(f"{v:.5f}" for v in r + u)


def _box(name, cx, cy, cz, sx, sy, sz, rgba, contact=0):
    return (f'<geom name="{name}" type="box" pos="{cx} {cy} {cz}" size="{sx/2} {sy/2} {sz/2}" '
            f'rgba="{rgba}" contype="{contact}" conaffinity="{contact}"/>')


def _offset(kind):
    verts, _, _ = G.build(kind)
    xs, zs = [v[0] for v in verts], [v[2] for v in verts]
    mx, mz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
    # After the rotation local (x, 0, z) -> world (x, z, 0): centre the mesh on the shelf.
    return CX - mx, CY - mz


def corners_xy(kind="towel"):
    """World (x, y) of the two pin vertices (left, right) as laid on the shelf."""
    verts, _, pins = G.build(kind)
    ox, oy = _offset(kind)
    return [(ox + verts[i][0], oy + verts[i][2]) for i in pins]


def build(obj, kind="towel", pads=False, grip_kp=None):
    ox, oy = _offset(kind)
    pos = (ox, oy, SHELF_Z + SHELF_T / 2 + 0.005)
    mass = G.DEFAULTS[kind]["mass"]
    c = "0.78 0.78 0.80 1"
    geoms = [
        _box("back", CX, Y0 + T / 2, H / 2, W, T, H, c),
        _box("left", T / 2, CY, H / 2, T, D, H, c),
        _box("right", W - T / 2, CY, H / 2, T, D, H, c),
        _box("top", CX, CY, H - T / 2, W, D, T, c).replace("/>", ' group="3"/>'),  # roof hidden so the top camera sees in
        _box("bottom", CX, CY, T / 2, W, D, T, c),
    ]
    cams = "\n    ".join(
        f'<camera name="{n}" pos="{p[0]} {p[1]} {p[2]}" xyaxes="{xyaxes(p, t)}" fovy="{f}"/>'
        for n, (p, t, f) in CAMERAS.items())
    return f"""<mujoco model="laundry">
  <option timestep="0.004" gravity="0 0 -9.81"/>
  <visual><global offwidth="1280" offheight="720"/><headlight ambient="0.25 0.25 0.25" diffuse="0.2 0.2 0.2" specular="0 0 0"/></visual>
  <worldbody>
    <light name="key" pos="-0.5 1.0 1.6" dir="0.8 -1.0 -1.4" diffuse="0.9 0.9 0.85" castshadow="false"/>
    <light name="fill" pos="1.5 0.8 0.9" dir="-1.2 -0.6 -0.5" diffuse="0.25 0.25 0.3" castshadow="false"/>
    <light name="lamp" pos="0.60 0.05 1.25" dir="0 0 -1" diffuse="0.35 0.28 0.18" castshadow="false"/>
    <geom name="floor" type="plane" size="2 2 0.1" rgba="0.25 0.25 0.27 1" contype="0" conaffinity="0"/>
    {chr(10).join("    " + g for g in geoms).strip()}
    {cams}
    {arms.worldbody_xml(pads).strip()}
    {board_xml()}
    <flexcomp name="garment" type="mesh" file="{os.path.abspath(obj)}" dim="2" pos="{pos[0]:.4f} {pos[1]:.4f} {pos[2]:.4f}" quat="0.7071 -0.7071 0 0" mass="{mass}" radius="0.003" rgba="0.2 0.45 0.8 1">
      <edge equality="true"/>
      <contact contype="1" conaffinity="1" condim="3" friction="0.8 0.02 0.001"/>
    </flexcomp>
  </worldbody>
  {board_contact_xml()}
  {arms.equality_xml()}
  {arms.actuator_xml(grip_kp)}
  {board_actuator_xml()}
</mujoco>
"""


def write(path, obj, kind="towel"):
    with open(path, "w") as f:
        f.write(build(obj, kind))
