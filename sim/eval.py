"""Baseline evaluation: N seeded runs of the fixed scripted fold on randomly dropped towels. Simulated.

Run i uses numpy.random.default_rng(seed + i): yaw fixed at 0, offset uniform +-0.04 m in x and y.
Perception: the grasp targets are the two front corners found from the garment's vertices (max-y vertex
on each side of the centroid x). The trajectory is the one from fold.py.
A run whose targets the arms cannot reach is recorded as NOREACH (a failure), not skipped.
"""
import os
os.environ.setdefault("MUJOCO_GL", "egl")  # before importing mujoco

import argparse
import math
import sys
import tempfile
import time

import mujoco
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fold
import garment
import scene

OFFSET = 0.04
HEADER = "run  yaw    dx     dy    width  depth  ontop   result    wrinkle"


def drop(rng):
    """Draw (yaw, dx, dy) for one run. Baseline: yaw is fixed at 0 (task 3.3; yaw is 3.6). Order is fixed so a seed names a pose."""
    return 0.0, float(rng.uniform(-OFFSET, OFFSET)), float(rng.uniform(-OFFSET, OFFSET))


def posed_obj(path, yaw, dx, dy):
    """Write the towel OBJ rotated by yaw about its centre and shifted by (dx, dy), in the garment's XZ plane
    (which scene.py maps to world xy with the same orientation)."""
    verts, faces, _ = garment.build("towel")
    xs, zs = [v[0] for v in verts], [v[2] for v in verts]
    cx, cz = (min(xs) + max(xs)) / 2, (min(zs) + max(zs)) / 2
    c, s = math.cos(math.radians(yaw)), math.sin(math.radians(yaw))
    out = [(cx + c * (x - cx) - s * (z - cz) + dx, y, cz + s * (x - cx) + c * (z - cz) + dy) for x, y, z in verts]
    garment.write_obj(path, out, faces)


def front_corners(pos):
    """Perception from world vertices at yaw 0: (left, right) front corners. Each is the max-y vertex on its side of
    the centroid x. The whole front row shares one y, so ties (within 1 um) go to the outermost x."""
    cx = pos[:, 0].mean()
    out = []
    for side, pick in ((pos[:, 0] < cx, np.argmin), (pos[:, 0] > cx, np.argmax)):
        p = pos[side]
        top = p[p[:, 1] > p[:, 1].max() - 1e-6]
        out.append(top[pick(top[:, 0])].copy())
    return out


def true_corners(dx, dy):
    """Ground truth: the two rectangle corners at max y for a towel dropped at (dx, dy), yaw 0."""
    xy = np.array(scene.corners_xy("towel")) + (dx, dy)
    return xy[np.argsort(xy[:, 0])]


def corner_drops(tmp, drops=None):
    """Position drops at yaw 0 (default: the 9 of dx, dy in {-0.04, 0, 0.04}): rows of (dx, dy, left, right, err_l, err_r, sep)."""
    rows = []
    for dx, dy in drops or [(a, b) for a in (-0.04, 0.0, 0.04) for b in (-0.04, 0.0, 0.04)]:
        obj = os.path.join(tmp, "towel.obj")
        posed_obj(obj, 0.0, dx, dy)
        m = mujoco.MjModel.from_xml_string(scene.build(obj, "towel"))
        d = mujoco.MjData(m)
        mujoco.mj_forward(m, d)
        l, r = front_corners(np.array(d.flexvert_xpos))
        tl, tr = true_corners(dx, dy)
        rows.append((dx, dy, l, r, float(np.linalg.norm(l[:2] - tl)), float(np.linalg.norm(r[:2] - tr)),
                     float(np.linalg.norm(l[:2] - r[:2]))))
    return rows


def one(i, seed, tmp, render=None):
    yaw, dx, dy = drop(np.random.default_rng(seed + i))
    obj = os.path.join(tmp, "towel.obj")
    posed_obj(obj, yaw, dx, dy)
    m = mujoco.MjModel.from_xml_string(scene.build(obj, "towel"))
    d = mujoco.MjData(m)
    mujoco.mj_forward(m, d)
    row = dict(run=i, yaw=yaw, dx=dx, dy=dy, width=float("nan"), depth=float("nan"), ontop=float("nan"),
               time=float("nan"), wrinkle=float("nan"), result="NOREACH")
    try:
        r = fold.run(m, corners=front_corners(np.array(d.flexvert_xpos)))
    except ValueError as e:
        row["why"] = str(e)
        return row                                      # IK: target out of reach or past a joint limit
    row.update(width=r["x1"] / r["x0"], depth=r["y1"] / r["y0"], ontop=r["z_moved"] - r["z_still"],
               time=r["time"], wrinkle=r["wrinkle"], result="FOLDED" if r["folded"] else "FAILED")
    if r["nan"]:
        row["result"] = "NAN"
    return row


def evaluate(runs, seed, tmp):
    return [one(i, seed, tmp) for i in range(runs)]


def fmt(r):
    return (f"{r['run']:>3}  {r['yaw']:>5.1f}° {r['dx']:>6.3f} {r['dy']:>6.3f}  {r['width']:>5.2f}  {r['depth']:>5.2f}  "
            f"{r['ontop']:>6.3f}  {r['result']:<8}  {r['wrinkle']:.3f}")


def summary(rows):
    ok = [r for r in rows if r["result"] == "FOLDED"]
    ran = [r for r in rows if r["result"] != "NOREACH"]
    mt = np.mean([r["time"] for r in ran]) if ran else float("nan")
    mw = np.mean([r["wrinkle"] for r in ran]) if ran else float("nan")
    return f"success: {len(ok)}/{len(rows)}   mean time: {mt:.1f} s   mean wrinkle: {mw:.3f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=10)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--corners", action="store_true", help="print the 9-drop corner table (task 3.5) and exit")
    a = ap.parse_args()
    if a.corners:
        with tempfile.TemporaryDirectory() as tmp:
            rows = corner_drops(tmp)
        print("   dx     dy    left(x,y)        right(x,y)       err_l  err_r  sep")
        for dx, dy, l, r, el, er, sep in rows:
            print(f"{dx:>6.2f} {dy:>6.2f}  ({l[0]:.3f},{l[1]:.3f})  ({r[0]:.3f},{r[1]:.3f})  {el:.4f} {er:.4f} {sep:.3f}")
        ok = sum(max(el, er) < 0.02 and sep > 0.6 for *_, el, er, sep in rows)
        print(f"pass: {ok}/9   worst error: {max(max(r[4], r[5]) for r in rows):.4f} m")
        return 0 if ok == 9 else 1
    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        rows = evaluate(a.runs, a.seed, tmp)
    head = (f"Simulated towel fold, scripted baseline, same fixed trajectory every run. "
            f"{a.runs} runs, seed {a.seed}, {time.strftime('%Y-%m-%d')}; no tuning, no train/test split (nothing is learned).")
    lines = [head, "", HEADER] + [fmt(r) for r in rows] + ["", summary(rows)]
    lines += [f"  run {r['run']}: {r['why']}" for r in rows if r.get("why")]
    print("\n".join(lines))
    print(f"wall: {time.time() - t0:.1f} s ({(time.time() - t0) / max(a.runs, 1):.1f} s/run)")
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "baseline.md"), "w") as f:
        f.write(f"{head}\n\n```\n" + "\n".join([HEADER] + [fmt(r) for r in rows]) + f"\n\n{summary(rows)}\n" + "".join(f"run {r['run']}: {r['why']}\n" for r in rows if r.get("why")) + "```\n"
                "\nWrinkle is a proxy: mean per-edge |length / rest length - 1| after the fold. "
                "Simulated, not a physical fold.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
