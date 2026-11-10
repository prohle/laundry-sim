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
SHELF_Z, SHELF_T = 0.69, 0.02
CAMERAS = {  # name: (position, target, fovy)
    "inside": ((0.60, 1.30, 1.05), (0.60, 0.05, 0.75), 45),
    "top": ((0.60, 0.05, 1.30), (0.60, 0.05, 0.70), 55),
}


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
        _box("top", CX, CY, H - T / 2, W, D, T, c),
        _box("bottom", CX, CY, T / 2, W, D, T, c),
        _box("shelf", CX, CY, SHELF_Z, W - 2 * T, D - 2 * T, SHELF_T, "0.55 0.40 0.28 1", contact=1),
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
    <flexcomp name="garment" type="mesh" file="{os.path.abspath(obj)}" dim="2" pos="{pos[0]:.4f} {pos[1]:.4f} {pos[2]:.4f}" quat="0.7071 -0.7071 0 0" mass="{mass}" radius="0.003" rgba="0.2 0.45 0.8 1">
      <edge equality="true"/>
      <contact contype="1" conaffinity="1" condim="3" friction="0.8 0.02 0.001"/>
    </flexcomp>
  </worldbody>
  {arms.equality_xml()}
  {arms.actuator_xml(grip_kp)}
</mujoco>
"""


def write(path, obj, kind="towel"):
    with open(path, "w") as f:
        f.write(build(obj, kind))
