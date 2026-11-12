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
FLAP_MU = 0.15                  # brief 34: flap-cloth friction on the flap path (was 0.8); the clamp bar and the board keep 0.8
FLAP_MU_ARMS = 0.8              # arms (loader) path: the half fold needs the stationary half to grip the flap it lies on
RIM, RIM_W = 0.02, 0.02         # brief 37: rim height and width; a shallow tray, a machine detail (was 0.02 both)
BAR_Y = (-0.20, 0.60)  # brief 36: range widened so the clamped bar can slide 0.50 m toward +y (the open front), off the board
# Brief 33 clamp: the bar is 0.60 x 0.12 x 0.04, parked above a vertical flap (top 0.715 + 0.267 = 0.98) and lowers
# until its bottom is at BAR_CLAMP_Z, pressing a strip of the stacked cloth on the centre panel.
BAR_REST_Z, BAR_CLAMP_Z = 1.02, 0.713
BAR_DROP = BAR_CLAMP_Z + 0.02 - BAR_REST_Z  # bar_z travel (negative) to put the bar bottom at BAR_CLAMP_Z
# Brief 39 blade: vertical plate 0.02 (x) x 0.60 (y) x 0.12 (z), centre z 0.72, prismatic in x from 0.22 to 0.60. Touches only the cloth.
BLADE_X, BLADE_Z, BLADE_HALF = (0.22, 0.60), 0.72, (0.01, 0.30, 0.06)
BEND_NU, BEND_T = 0.3, 0.006    # brief 39: bending flex (elastic2d="bend"); thickness = 2 x flex radius, as the docs suggest


def board_xml(flap_mu=FLAP_MU_ARMS, blade=False):
    """Tri-fold board: a centre panel and four coplanar flaps, hinged 15 mm above the top surface, plus the smoothing bar."""
    z, th = BOARD_C[2], SHELF_T
    rgba = "0.55 0.40 0.28 1"
    fr = 'contype="1" conaffinity="1" friction="0.8 0.02 0.001"'
    # Brief 34: the flap lets go of the cloth. priority 1 makes the contact use the flap's friction, not the max of the two.
    ff = f'contype="1" conaffinity="1" friction="{flap_mu} 0.02 0.001" priority="1"'
    # Brief 34 rim: 0.02 m high and wide, just outside the 0.80 x 0.70 flap extent; part of the board body (excluded from the flaps).
    hx_, hy_, rz = 1.5 * BW, 1.5 * BD, th / 2 + RIM / 2
    rim = "".join(
        f'<geom name="rim_{n}" type="box" pos="{px:.5f} {py:.5f} {rz:.5f}" size="{sx:.5f} {sy:.5f} {RIM / 2}" rgba="{rgba}" {fr}/>'
        for n, px, py, sx, sy in (("l", -hx_ - RIM_W / 2, 0, RIM_W / 2, hy_ + RIM_W), ("r", hx_ + RIM_W / 2, 0, RIM_W / 2, hy_ + RIM_W),
                                  ("f", 0, hy_ + RIM_W / 2, hx_, RIM_W / 2), ("b", 0, -hy_ - RIM_W / 2, hx_, RIM_W / 2)))
    out = [f'<body name="board" pos="{BOARD_C[0]} {BOARD_C[1]} {z - th / 2}">'
           f'<geom name="board" type="box" size="{BW / 2} {BD / 2} {th / 2}" rgba="{rgba}" {fr}/>{rim}</body>']
    for n, ((hx, hy), (ux, uy), axis, across, along) in FLAPS.items():
        sx, sy = (across, along) if ux else (along, across)
        out.append(
            f'<body name="flap_{n}" pos="{hx:.5f} {hy:.5f} {HINGE_Z}">'
            f'<joint name="hinge_{n}" type="hinge" axis="{axis}" range="0 180" damping="{FLAP_KV}"/>'
            f'<geom name="flap_{n}" type="box" pos="{ux * across / 2:.5f} {uy * across / 2:.5f} {z - th / 2 - HINGE_Z:.5f}" '
            f'size="{sx / 2:.5f} {sy / 2:.5f} {th / 2}" density="300" rgba="0.85 0.70 0.35 1" {ff}/></body>')
    out.append(
        f'<body name="bar" pos="{BOARD_C[0]} {BAR_Y[0]} {BAR_REST_Z}">'
        f'<joint name="bar_y" type="slide" axis="0 1 0" range="0 {BAR_Y[1] - BAR_Y[0]}" damping="{FLAP_KV}"/>'
        f'<joint name="bar_z" type="slide" axis="0 0 1" range="{BAR_DROP:.4f} 0" damping="{FLAP_KV}"/>'
        # contype 2 / conaffinity 0: the bar touches only the cloth (conaffinity 3), not the flaps, board or arms
        f'<geom name="bar" type="box" size="0.30 0.06 0.02" mass="0.2" rgba="0.3 0.3 0.35 1" contype="2" conaffinity="0"/></body>')
    if blade:
        hx, hy, hz = BLADE_HALF
        out.append(
            f'<body name="blade" pos="{BLADE_X[0]} {BOARD_C[1]} {BLADE_Z}">'
            f'<joint name="blade_x" type="slide" axis="1 0 0" range="0 {BLADE_X[1] - BLADE_X[0]:.4f}" damping="{FLAP_KV}"/>'
            f'<geom name="blade" type="box" size="{hx} {hy} {hz}" mass="0.2" rgba="0.3 0.3 0.35 1" contype="2" conaffinity="0" '
            f'friction="0.8 0.02 0.001"/></body>')
    return "\n    ".join(out)


def drive_flap(model, data, name, angle_deg, ramp=200, hold=200, cb=None, every=100):
    """Ramp a flap to angle_deg over `ramp` steps, hold `hold` steps. Returns the final hinge angle in degrees.
    cb(): optional, called every `every` steps (the flap-path property samples the footprint with it)."""
    import mujoco
    import numpy as np
    act, goal = model.actuator(f"act_hinge_{name}").id, math.radians(angle_deg)
    for i in range(ramp + hold):
        data.ctrl[act] = goal * min(1.0, (i + 1) / ramp)
        mujoco.mj_step(model, data)
        if cb and (i + 1) % every == 0 and i < ramp:  # brief 36: ramps only, not the hold
            cb()
    return float(np.degrees(data.joint(f"hinge_{name}").qpos[0]))


def board_contact_xml():
    """Flaps may not collide with the board or each other (they sweep through its edge); the cloth still meets them."""
    names = ["board"] + [f"flap_{n}" for n in FLAPS]
    pairs = [(a, b) for i, a in enumerate(names) for b in names[i + 1:]]
    return "<contact>" + "".join(f'<exclude body1="{a}" body2="{b}"/>' for a, b in pairs) + "</contact>"


def board_actuator_xml(blade=False):
    rows = [f'<position name="act_hinge_{n}" joint="hinge_{n}" kp="{FLAP_KP}" ctrlrange="0 {math.pi:.5f}"/>' for n in FLAPS]
    rows.append(f'<position name="act_bar_y" joint="bar_y" kp="2000" ctrlrange="0 {BAR_Y[1] - BAR_Y[0]}"/>')
    rows.append(f'<position name="act_bar_z" joint="bar_z" kp="2000" ctrlrange="{BAR_DROP:.4f} 0"/>')
    if blade:
        rows.append(f'<position name="act_blade_x" joint="blade_x" kp="2000" ctrlrange="0 {BLADE_X[1] - BLADE_X[0]:.4f}"/>')
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


def build(obj, kind="towel", pads=False, grip_kp=None, flap_mu=FLAP_MU_ARMS, blade=False, bend=None):
    """blade: add the brief 39 blade. bend: Young's modulus (Pa) for the cloth's bending stiffness, None = no bending term."""
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
    {board_xml(flap_mu, blade)}
    <flexcomp name="garment" type="mesh" file="{os.path.abspath(obj)}" dim="2" pos="{pos[0]:.4f} {pos[1]:.4f} {pos[2]:.4f}" quat="0.7071 -0.7071 0 0" mass="{mass}" radius="0.003" rgba="0.2 0.45 0.8 1">
      <edge equality="true"/>
      {f'<elasticity young="{bend:g}" poisson="{BEND_NU}" thickness="{BEND_T}" elastic2d="bend"/>' if bend else ""}
      <contact contype="1" conaffinity="3" condim="3" friction="0.8 0.02 0.001"/>
    </flexcomp>
  </worldbody>
  {board_contact_xml()}
  {arms.equality_xml()}
  {arms.actuator_xml(grip_kp)}
  {board_actuator_xml(blade)}
</mujoco>
"""


def write(path, obj, kind="towel"):
    with open(path, "w") as f:
        f.write(build(obj, kind))
