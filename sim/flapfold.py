"""Flap-program fold on the folding board (task 7.2): each step folds a flap to 180 deg, holds, retracts, holds.
The cloth should stay on the centre panel after the retract. Simulated, not a physical fold.

Check (replaces width/depth for this path; fold.py's half-fold check stays for the arms path):
  area    convex-hull footprint after / before <= AREA_MAX
  stacked mean garment z >= board top + STACK_MIN
  centre  >= CENTRE_MIN of the vertices inside the centre panel's x/y bounds after the final retract
  nan     no NaN, no vertex outside the cabinet
"""
import os
os.environ.setdefault("MUJOCO_GL", "egl")  # before importing mujoco

import argparse
import sys
import tempfile

import mujoco
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import garment
import scene

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
SETTLE = 200
TIMESTEP = 0.002  # brief 33: halved from 0.004 after the 0.004 run blew up at the second flap
FOLD_STEPS, HOLD, RETRACT_STEPS = 400, 200, 400  # brief 33: slow sweep, 200-step hold between
BAR_RAMP, BAR_HOLD = 200, 100
BAR_SLIDE, BAR_SLIDE_STEPS = 0.50, 150  # brief 36: sideways release (m toward +y, steps)
BAR_LIFT, BAR_LIFT_STEPS = 0.003, 50  # brief 37: lift before sliding
AREA_MAX, STACK_MIN, STACK_MAX, CENTRE_MIN = 0.50, 0.003, 0.040, 0.60
FLAT_SETTLE = 500  # brief 35: steps after all four flaps are flat, before measuring
BOARD_TOP = scene.BOARD_C[2]
TOWEL_ORDER = ("left", "right", "front", "back")


def hull_area(p):
    """Convex-hull area of the xy footprint (monotone chain + shoelace)."""
    pts = sorted(set(map(tuple, np.round(p[:, :2], 6))))
    def half(seq):
        h = []
        for q in seq:
            while len(h) >= 2 and (h[-1][0] - h[-2][0]) * (q[1] - h[-2][1]) - (h[-1][1] - h[-2][1]) * (q[0] - h[-2][0]) <= 0:
                h.pop()
            h.append(q)
        return h[:-1]
    hl = half(pts) + half(pts[::-1])
    x, y = np.array(hl).T
    return float(abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1))) / 2)


def run(m, order=TOWEL_ORDER, retract_deg=90.0, frames=None, bar=True, trace=None):
    """Fold-and-retract each flap in order. Returns dict: a0, areas (per step), area, z, nan, folded, angles; d is returned as 'data'.
    trace: optional list; the hull area ratio is appended every 100 steps of the fold and retract (the flap-path extent property)."""
    d = mujoco.MjData(m)
    mujoco.mj_forward(m, d)
    for _ in range(SETTLE):
        mujoco.mj_step(m, d)
    a0 = hull_area(np.array(d.flexvert_xpos))
    cb = (lambda: trace.append(hull_area(np.array(d.flexvert_xpos)) / a0)) if trace is not None else None
    if cb:
        cb()
    areas, zs, angles, flat_z = [], [], [], []
    for n in order:
        ang = scene.drive_flap(m, d, n, 180, ramp=FOLD_STEPS, hold=HOLD, cb=cb)
        p_f = np.array(d.flexvert_xpos)
        if bar:  # brief 33 step 3: clamp the fold with the bar while the flap retracts
            drive_bar(m, d, y=scene.CY_B, z=scene.BAR_DROP, hold=BAR_HOLD)
        back = scene.drive_flap(m, d, n, retract_deg, ramp=RETRACT_STEPS, hold=0, cb=cb)
        if not bar:  # brief 38: no clamp; settle 500 after the retract
            for _ in range(FLAT_SETTLE):
                mujoco.mj_step(m, d)
        if bar:  # brief 36: release the clamp sideways at the clamped height, then lift, then hold
            drive_bar(m, d, y=scene.CY_B, z=scene.BAR_DROP + BAR_LIFT, ramp=BAR_LIFT_STEPS)  # brief 37: 1. lift 3 mm, stops pressing
            drive_bar(m, d, y=scene.CY_B + BAR_SLIDE, z=scene.BAR_DROP + BAR_LIFT, ramp=BAR_SLIDE_STEPS)  # 2. slide over the cloth
            drive_bar(m, d, y=scene.CY_B + BAR_SLIDE, z=0.0, hold=BAR_HOLD)  # 3. lift to park
            drive_bar(m, d, y=scene.CY_B, z=0.0)  # return over the board (bar is lifted, touches nothing) for the next clamp
        p = np.array(d.flexvert_xpos)
        areas.append((hull_area(p_f) / a0, hull_area(p) / a0))
        zs.append(float(p[:, 2].mean()))
        angles.append((ang, back))
    # brief 35: bar is up (released after the last step); lay all four flaps flat, then settle, then measure.
    for n in TOWEL_ORDER:
        scene.drive_flap(m, d, n, 0, ramp=RETRACT_STEPS, hold=0)  # brief 36: not sampled; extent_monotone covers the fold ramps only
        flat_z.append(float(np.array(d.flexvert_xpos)[:, 2].mean()))
    for _ in range(FLAT_SETTLE):
        mujoco.mj_step(m, d)
    p = np.array(d.flexvert_xpos)
    # "no NaN" also rejects a blow-up: every vertex finite and inside the cabinet box (a diverged cloth stays finite).
    inside = (p[:, 0] > 0) & (p[:, 0] < scene.W) & (p[:, 1] > scene.Y0) & (p[:, 1] < scene.Y0 + scene.D) & (p[:, 2] > 0) & (p[:, 2] < scene.H)
    nan = bool(np.isnan(p).any() or np.isnan(d.qpos).any() or not inside.all())
    area, z = (hull_area(p) / a0, float(p[:, 2].mean())) if not np.isnan(p).any() else (float("nan"), float("nan"))  # printed even on a blow-up
    on_c = float(((abs(p[:, 0] - scene.BOARD_C[0]) <= scene.BW / 2) & (abs(p[:, 1] - scene.BOARD_C[1]) <= scene.BD / 2)).mean()) if not nan else 0.0
    folded = (not nan) and area <= AREA_MAX and STACK_MIN <= z - BOARD_TOP <= STACK_MAX and on_c >= CENTRE_MIN
    return dict(order=tuple(order), a0=a0, areas=areas, zs=zs, angles=angles, area=area, z=z, nan=nan, folded=folded, data=d,
                centre=on_c, flat_z=flat_z, fell=int((p[:, 2] < BOARD_TOP - 0.02).sum()), n=len(p))


def drive_bar(m, d, y, z, ramp=BAR_RAMP, hold=0):
    """Move the bar: first y (at its current height), then z (bar_z, 0 = parked). y is the world y of the bar centre."""
    ay, az = m.actuator("act_bar_y").id, m.actuator("act_bar_z").id
    for ctrl, goal in ((ay, y - scene.BAR_Y[0]), (az, z)):
        start = float(d.ctrl[ctrl])
        for i in range(ramp):
            d.ctrl[ctrl] = start + (goal - start) * (i + 1) / ramp
            mujoco.mj_step(m, d)
    for _ in range(hold):
        mujoco.mj_step(m, d)


def render(m, d, camera, path):
    from PIL import Image
    r = mujoco.Renderer(m, height=720, width=1280)
    try:
        r.update_scene(d, camera=camera)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        Image.fromarray(r.render()).save(path)
    finally:
        r.close()


def model_for(kind, tmp, dx=0.0, dy=0.0, blade=False, bend=None):
    import eval as E
    obj = os.path.join(tmp, f"{kind}.obj")
    E.posed_obj(obj, 0.0, dx, dy, kind)
    m = mujoco.MjModel.from_xml_string(scene.build(obj, kind, flap_mu=scene.FLAP_MU, blade=blade, bend=bend))
    m.opt.timestep = TIMESTEP  # flap path only; the arms path keeps scene.py's 0.004
    return m


def run_blade(m):
    """Brief 39: one blade sweep (x 0.22 -> 0.60, 600 steps), hold, retract, settle. Same keys as run() for the summary."""
    d = mujoco.MjData(m)
    mujoco.mj_forward(m, d)
    for _ in range(SETTLE):
        mujoco.mj_step(m, d)
    a0 = hull_area(np.array(d.flexvert_xpos))
    act, hi = m.actuator("act_blade_x").id, scene.BLADE_X[1] - scene.BLADE_X[0]
    for goal, ramp, hold in ((hi, 600, 200), (0.0, 300, 300)):
        start = float(d.ctrl[act])
        for i in range(ramp):
            d.ctrl[act] = start + (goal - start) * (i + 1) / ramp
            mujoco.mj_step(m, d)
        for _ in range(hold):
            mujoco.mj_step(m, d)
    return summarise(d, a0)


def summarise(d, a0):
    p = np.array(d.flexvert_xpos)
    if np.isnan(p).any():
        return dict(area=float("nan"), z=float("nan"), centre=0.0, fell=len(p), n=len(p), nan=True, data=d)
    on_c = float(((abs(p[:, 0] - scene.BOARD_C[0]) <= scene.BW / 2) & (abs(p[:, 1] - scene.BOARD_C[1]) <= scene.BD / 2)).mean())
    return dict(area=hull_area(p) / a0, z=float(p[:, 2].mean()), centre=on_c, fell=int((p[:, 2] < BOARD_TOP - 0.02).sum()), n=len(p),
                nan=False, data=d)


def line(r):
    return (f"area ratio {r['area']:.3f}, mean z {(r['z'] - BOARD_TOP) * 1000:.1f} mm over board, on centre {r['centre'] * 100:.0f}%, "
            f"below board {r['fell']}/{r['n']}, nan {r['nan']}")


def is_fold(r):
    return (not r["nan"]) and 0.40 <= r["area"] <= 0.60 and r["centre"] > 0.60


def report(r):
    print(f"  area before {r['a0']:.4f} m2, after {r['area'] * r['a0']:.4f} m2 (ratio {r['area']:.3f})")
    for n, (f, b), (af, ab), z in zip(r["order"], r["angles"], r["areas"], r["zs"]):
        print(f"  {n:<6} fold {f:6.1f} deg area {af:.3f}   retract {b:6.1f} deg area {ab:.3f}   mean z {z:.4f}")
    print("  flat retract mean z (mm over board): " + ", ".join(f"{(z - BOARD_TOP) * 1000:.1f}" for z in r["flat_z"]))
    print(f"  area {r['area']:.3f} (<= {AREA_MAX}), stacked: mean z {r['z']:.4f} = board top + {(r['z'] - BOARD_TOP) * 1000:.1f} mm "
          f"(band {STACK_MIN * 1000:.0f}-{STACK_MAX * 1000:.0f} mm), on centre {r['centre'] * 100:.0f}% (>= {CENTRE_MIN * 100:.0f}%), nan {r['nan']}, below board {r['fell']}/{r['n']}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--garment", choices=("towel",), default="towel")
    ap.add_argument("--retract", type=float, default=90.0, help="retract angle in degrees (default 90, vertical)")
    ap.add_argument("--no-bar", action="store_true", help="retract without the bar clamp (brief 33 steps 1-2 only)")
    ap.add_argument("--mu", type=float, default=None, help="flap-cloth friction (default scene.FLAP_MU)")
    ap.add_argument("--steps", default="", help="comma list of flaps to fold (default all four), e.g. left")
    ap.add_argument("--clamp", action="store_true", help="use the bar clamp (brief 38: off by default)")
    ap.add_argument("--mode", choices=("flap", "blade"), default="flap", help="brief 39: flap program or one blade sweep")
    ap.add_argument("--young", type=float, default=None, help="brief 39: cloth bending Young's modulus in Pa (default: no bending term)")
    ap.add_argument("--sweep", default="", help="brief 39: comma list of --young values; prints one table for the current --mode")
    a = ap.parse_args()
    order = tuple(s for s in a.steps.split(",") if s) or TOWEL_ORDER
    if a.mu is not None:
        scene.FLAP_MU = a.mu
    blade = a.mode == "blade"

    def once(tmp, young):
        m = model_for(a.garment, tmp, blade=blade, bend=young)
        r = run_blade(m) if blade else run(m, order=order, retract_deg=a.retract, bar=a.clamp and not a.no_bar)
        if not blade:
            r = {**r, **summarise(r["data"], r["a0"])}  # one metric definition for both modes
        return m, r

    if a.sweep:
        with tempfile.TemporaryDirectory() as tmp:
            print(f"mode {a.mode}, steps {','.join(order) if not blade else '-'}")
            for y in (float(s) for s in a.sweep.split(",")):
                _, r = once(tmp, y)
                print(f"  young {y:>9g}: {line(r)}  {'FOLD' if is_fold(r) else 'no'}")
        return 0
    with tempfile.TemporaryDirectory() as tmp:
        m, r = once(tmp, a.young)
        tag = "blade" if blade else "flap"
        print(f"mode {a.mode}, young {a.young}: {line(r)}")
        render(m, r["data"], "top", os.path.join(OUT, f"{tag}_towel.png"))
    print("FOLD" if is_fold(r) else "NO FOLD", "(simulated)")
    return 0 if is_fold(r) else 1



if __name__ == "__main__":
    sys.exit(main())
