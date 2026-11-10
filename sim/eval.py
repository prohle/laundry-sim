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
import program
import scene

OFFSET = 0.04
HEADER = "run  yaw    dx     dy    width  depth  ontop   result    wrinkle"


def drop(rng):
    """Draw (yaw, dx, dy) for one run. Baseline: yaw is fixed at 0 (task 3.3; yaw is 3.6). Order is fixed so a seed names a pose."""
    return 0.0, float(rng.uniform(-OFFSET, OFFSET)), float(rng.uniform(-OFFSET, OFFSET))


def posed_obj(path, yaw, dx, dy, kind="towel"):
    """Write the garment OBJ rotated by yaw about its centre and shifted by (dx, dy), in the garment's XZ plane
    (which scene.py maps to world xy with the same orientation)."""
    verts, faces, _ = garment.build(kind)
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


def one(i, seed, tmp, render=None, D=None, friction=False, grip_kp=None):
    """D=None: scripted baseline (absolute fold target fold.Y_FOLD). D=float: relative controller,
    fold_target_y = mean(y_l, y_r) - D from the perceived corners. A hand-set controller, not RL."""
    yaw, dx, dy = drop(np.random.default_rng(seed + i))
    obj = os.path.join(tmp, "towel.obj")
    posed_obj(obj, yaw, dx, dy)
    m = mujoco.MjModel.from_xml_string(scene.build(obj, "towel", pads=friction, grip_kp=grip_kp))
    d = mujoco.MjData(m)
    mujoco.mj_forward(m, d)
    row = dict(run=i, yaw=yaw, dx=dx, dy=dy, width=float("nan"), depth=float("nan"), ontop=float("nan"),
               time=float("nan"), wrinkle=float("nan"), result="NOREACH")
    try:
        cs = front_corners(np.array(d.flexvert_xpos))
        yf = None if D is None else float((cs[0][1] + cs[1][1]) / 2 - D)
        r = (fold.run(m, corners=cs, y_fold=yf, friction=True) if friction else
             program.run_program(m, program.towel_program(yf), corners=cs))
    except ValueError as e:
        row["why"] = str(e)
        return row                                      # IK: target out of reach or past a joint limit
    row.update(width=r["x1"] / r["x0"], depth=r["y1"] / r["y0"], ontop=r["z_moved"] - r["z_still"],
               time=r["time"], wrinkle=r["wrinkle"], slip=r["slip"], result="FOLDED" if r["folded"] else "FAILED")
    if r["nan"]:
        row["result"] = "NAN"
    return row


def evaluate(runs, seed, tmp, D=None):
    return [one(i, seed, tmp, D=D) for i in range(runs)]


D_GRID = (0.26, 0.28, 0.30, 0.32, 0.34)
FIT_SEEDS, TEST_SEEDS = range(1, 6), range(6, 11)
D_CHOSEN = 0.30   # placeholder until the fit on seeds 1-5 has run; replaced by the fit result


def nfolded(rows):
    return sum(r["result"] == "FOLDED" for r in rows)


def experiment(runs, tmp):
    """4.2/4.3: scan D on seeds 1-5 only, pick the best, then evaluate on seeds 6-10 (chosen D and scripted)."""
    fit = {D: [r for s in FIT_SEEDS for r in evaluate(runs, s, tmp, D)] for D in D_GRID}
    best = max(D_GRID, key=lambda D: (nfolded(fit[D]), -abs(D - 0.30)))   # ties: nearest the nominal 0.30
    test = {"scripted": [r for s in TEST_SEEDS for r in evaluate(runs, s, tmp)],
            "relative": [r for s in TEST_SEEDS for r in evaluate(runs, s, tmp, best)]}
    return fit, best, test


def fmt(r):
    return (f"{r['run']:>3}  {r['yaw']:>5.1f}° {r['dx']:>6.3f} {r['dy']:>6.3f}  {r['width']:>5.2f}  {r['depth']:>5.2f}  "
            f"{r['ontop']:>6.3f}  {r['result']:<8}  {r['wrinkle']:.3f}")


def summary(rows):
    ok = [r for r in rows if r["result"] == "FOLDED"]
    ran = [r for r in rows if r["result"] != "NOREACH"]
    mt = np.mean([r["time"] for r in ran]) if ran else float("nan")
    mw = np.mean([r["wrinkle"] for r in ran]) if ran else float("nan")
    return f"success: {len(ok)}/{len(rows)}   mean time: {mt:.1f} s   mean wrinkle: {mw:.3f}"


def friction_table(a, out):
    """Task 2.5: contact grasp (finger pads, no vertex override) at two closing forces vs the kinematic grasp, same seeds."""
    L = [f"Simulated towel fold, friction grasp (pad friction 1.2, condim 6, no vertex override). {a.runs} runs, seed {a.seed}, {time.strftime('%Y-%m-%d')}.",
         "Scripted trajectory, perceived corners. Kinematic grasp = the shipped one, same drops. One pass, no tuning.", ""]
    with tempfile.TemporaryDirectory() as tmp:
        kin = evaluate(a.runs, a.seed, tmp)
        res = {kp: [one(i, a.seed, tmp, friction=True, grip_kp=kp) for i in range(a.runs)] for kp in (40, 80)}
    L += ["| grasp | folded | slip point (runs) |", "|---|---|---|", f"| kinematic | {nfolded(kin)}/{len(kin)} | - |"]
    for kp, rows in res.items():
        sl = {}
        for r in rows:
            sl[r.get("slip", "NOREACH")] = sl.get(r.get("slip", "NOREACH"), 0) + 1
        L.append(f"| friction, grip kp {kp} | {nfolded(rows)}/{len(rows)} | {sl} |")
    for kp, rows in res.items():
        L += ["", f"grip kp {kp}", "```", HEADER] + [fmt(r) for r in rows] + ["```"]
    best = max(nfolded(r) for r in res.values())
    L += ["", f"Gap (best friction vs kinematic): {nfolded(kin) - best} of {len(kin)} runs.", "", "Simulated, not a physical fold. Wrinkle is a proxy."]
    os.makedirs(out, exist_ok=True)
    open(os.path.join(out, "friction.md"), "w").write("\n".join(L) + "\n")
    print("\n".join(L))
    return 0


def tee_run(i, seed, tmp, inward=0.17, lift_z=fold.Z_LIFT):
    """Task 5.6: two-step tee program on a tee dropped at (dx, dy), yaw 0. Landmarks are ground truth from the drop
    (the mesh landmark plus the drop offset), not perceived; the towel path perceives its corners."""
    yaw, dx, dy = drop(np.random.default_rng(seed + i))
    obj = os.path.join(tmp, "tee.obj")
    posed_obj(obj, yaw, dx, dy, "tee")
    m = mujoco.MjModel.from_xml_string(scene.build(obj, "tee"))
    d = mujoco.MjData(m)
    mujoco.mj_forward(m, d)
    ox, oy = scene._offset("tee")
    pos = np.array(d.flexvert_xpos)
    lm = {n: (ox + x + dx, oy + z + dy) for n, (x, z) in garment.build_full("tee")[3].items()}
    cs = [pos[np.argmin(np.hypot(pos[:, 0] - lm[n][0], pos[:, 1] - lm[n][1]))].copy() for n in ("sleeve_l", "sleeve_r")]
    row = dict(run=i, dx=dx, dy=dy, steps=[], result="NOREACH")
    try:
        r = program.run_program(m, program.tee_program(dx, inward, lift_z), corners=cs, landmarks=lm, kind="tee", whole_checks=False)
    except ValueError as e:
        row["why"] = str(e)
        return row
    row.update(steps=r["steps"], result="FOLDED" if r["folded"] else "FAILED", wrinkle=r["wrinkle"])
    return row


def tee_table(a):
    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        rows = [tee_run(i, a.seed, tmp, a.inward, a.lift) for i in range(a.runs)]
    L = [f"Simulated tee fold, two-step program (sleeves_in, body_half), kinematic grasp. {a.runs} runs, seed {a.seed}, inward {a.inward}, lift {a.lift}.",
         "Yaw 0, position +-0.04 m. Landmarks from the drop (ground truth). No tuning on these seeds beyond what is stated.", "",
         "run    dx     dy   sleeves_in  body_half  result"]
    names = ("sleeves_in", "body_half")
    for r in rows:
        cell = {s["name"]: ("ok" if s["ok"] else ("NOREACH" if "noreach" in s["numbers"] else "fail")) for s in r["steps"]}
        L.append(f"{r['run']:>3} {r['dx']:>6.3f} {r['dy']:>6.3f}  " + "  ".join(f"{cell.get(n, '-'):<10}" for n in names) + f" {r['result']}")
        for s in r["steps"]:
            L.append(f"      {s['name']}: {s['numbers']}")
        if r.get("why"):
            L.append(f"      {r['why']}")
    n = len(rows)
    L += ["", "step pass: " + ", ".join(f"{nm} {sum(any(s['name'] == nm and s['ok'] for s in r['steps']) for r in rows)}/{n}" for nm in names),
          f"success: {nfolded(rows)}/{n}", "Simulated, not a physical fold."]
    print("\n".join(L))
    print(f"wall: {time.time() - t0:.0f} s")
    return 0


DROPS9 = [(a, b) for a in (-0.04, 0.0, 0.04) for b in (-0.04, 0.0, 0.04)]


def scan_margin(lift, inward, z_down):
    """Smallest distance to a joint limit (rad) along the towel path over the 9 drops, and the joint that sets it.
    Path per arm: ready hover over the corner -> lift -> inward -> carry to Y_FOLD -> lower; straight lines in pinch space.
    A target out of reach counts as margin -1."""
    import arms
    saved, lim = dict(arms.RANGES), dict(arms.RANGES)
    arms.RANGES = {k: (-9.0, 9.0) for k in saved}
    worst, joint = 9.0, ""
    try:
        for dx, dy in DROPS9:
            for side, c in zip(arms.SIDES, true_corners(dx, dy)):
                z0 = scene.SHELF_Z + scene.SHELF_T / 2 + 0.015
                sg = 1.0 if side == "l" else -1.0
                way = [(c[0], c[1], z0 + arms.HOVER), (c[0], c[1], lift), (c[0] + sg * inward, c[1], lift),
                       (c[0] + sg * inward, fold.Y_FOLD, lift), (c[0] + sg * inward, fold.Y_FOLD, z_down)]
                for a, b in zip(way, way[1:]):
                    for t in np.linspace(0, 1, 11):
                        try:
                            q = arms.ik(side, tuple(np.array(a) + t * (np.array(b) - np.array(a))))
                        except ValueError:
                            return -1.0, "reach"
                        for k in arms.HINGES:
                            m_ = min(q[k] - lim[k][0], lim[k][1] - q[k])
                            if m_ < worst:
                                worst, joint = m_, k
    finally:
        arms.RANGES = saved
    return worst, joint


def scan_table():
    """Task 5.8: joint-limit scan over (Z_LIFT, INWARD) for the towel path at the new geometry. Margin = rad to the nearest limit."""
    z_down = scene.SHELF_Z + scene.SHELF_T / 2 + 0.06
    lifts = [round(z_down + 0.02 * k, 3) for k in range(0, 13)]
    ins = [round(0.025 * k, 3) for k in range(0, 11)]
    print(f"joint-limit scan, towel path, 9 drops, Z_DOWN {z_down:.2f} (shelf top + 0.06), Y_FOLD {fold.Y_FOLD}; margin to nearest limit in rad (limiting joint)")
    print("lift\\inward " + " ".join(f"{i:>11.3f}" for i in ins))
    best = (-9.0, None)
    for lf in lifts:
        row = []
        for i in ins:
            mg, j = scan_margin(lf, i, z_down)
            row.append(f"{mg:>6.2f} {j[:5]:<4}")
            if mg > best[0]:
                best = (mg, (lf, i, j))
        print(f"{lf:>10.2f}   " + " ".join(row))
    print(f"best: margin {best[0]:.3f} rad ({best[1][2]}) at Z_LIFT {best[1][0]}, INWARD {best[1][1]}")
    return 0


def reach_table():
    """Task 5.8: tee at the 9 position drops; ready pose over each of hem_l/hem_r and shoulder_l/shoulder_r; settled pinch distance (m)."""
    import arms
    names = (("hem_l", "hem_r"), ("shoulder_l", "shoulder_r"))
    print("tee reach: pinch-to-landmark vertex distance after 200 steps at the ready pose (hover 0.05 included); limit 0.08")
    print("   dx     dy   " + "  ".join(f"{n:>10}" for pr in names for n in pr))
    ok = 0
    with tempfile.TemporaryDirectory() as tmp:
        for dx, dy in DROPS9:
            obj = os.path.join(tmp, "tee.obj")
            posed_obj(obj, 0.0, dx, dy, "tee")
            m = mujoco.MjModel.from_xml_string(scene.build(obj, "tee"))
            ox, oy = scene._offset("tee")
            lm = {n: (ox + x + dx, oy + z + dy) for n, (x, z) in garment.build_full("tee")[3].items()}
            cells, good = [], True
            for pr in names:
                d = mujoco.MjData(m)
                mujoco.mj_forward(m, d)
                pos = np.array(d.flexvert_xpos)
                cs = [pos[np.argmin(np.hypot(pos[:, 0] - lm[n][0], pos[:, 1] - lm[n][1]))].copy() for n in pr]
                try:
                    ctrl, cs = arms.ready_pose(m, d, cs=cs)
                except ValueError as e:
                    cells += [f"NOREACH"] * 2
                    good = False
                    print(f"      {pr}: {e}")
                    continue
                arms.apply(m, d, ctrl)
                for _ in range(200):
                    mujoco.mj_step(m, d)
                if (dx, dy) == (0.0, 0.0) and pr == names[0]:   # frame: both arms hovering over the tee hem
                    from PIL import Image
                    rr = mujoco.Renderer(m, height=720, width=1280)
                    rr.update_scene(d, camera="inside")
                    os.makedirs(os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"), exist_ok=True)
                    Image.fromarray(rr.render()).save(os.path.join(os.path.dirname(os.path.abspath(__file__)), "out", "arms.png"))
                    rr.close()
                for s, c in zip(arms.SIDES, cs):
                    dist = float(np.linalg.norm(arms.pinch(m, d, s) - c))
                    cells.append(f"{dist:.3f}")
                    good &= dist < 0.08
            ok += good
            print(f"{dx:>6.2f} {dy:>6.2f}   " + "  ".join(f"{c:>10}" for c in cells))
    print(f"pass: {ok}/9")
    return 0 if ok == 9 else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--garment", choices=("towel", "tee"), default="towel")
    ap.add_argument("--inward", type=float, default=0.17, help="tee: sleeve inward distance")
    ap.add_argument("--lift", type=float, default=fold.Z_LIFT, help="tee: lift height")
    ap.add_argument("--runs", type=int, default=10)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--corners", action="store_true", help="print the 9-drop corner table (task 3.5) and exit")
    ap.add_argument("--policy", choices=("scripted", "relative", "friction"), default=None,
                    help="scripted: absolute fold target; relative: fold_target_y = mean(y_l, y_r) - D. Given, baseline.md is not written")
    ap.add_argument("--D", type=float, default=None, help=f"relative policy depth, default {D_CHOSEN}")
    ap.add_argument("--experiment", action="store_true", help="4.2/4.3: fit D on seeds 1-5, test on seeds 6-10, write out/policy.md")
    ap.add_argument("--clean", action="store_true", help="4.6: scripted, patch 0.12 and 0.16, seeds 11-20 x 10 runs, write out/clean.md")
    ap.add_argument("--scan", action="store_true", help="5.8: joint-limit scan over Z_LIFT x INWARD for the towel path")
    ap.add_argument("--reach", action="store_true", help="5.8: tee reach table at the 9 drops")
    a = ap.parse_args()
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
    if a.scan:
        return scan_table()
    if a.reach:
        return reach_table()
    if a.garment == "tee":
        return tee_table(a)
    if a.clean:
        used = {s + i for s in TEST_SEEDS for i in range(10)}   # rng seeds already drawn in the seeds 6-10 runs
        L = [f"Simulated towel fold, scripted policy, no tuning. Seeds 11-20 x 10 runs per config, {time.strftime('%Y-%m-%d')}.",
             "Run i of seed s draws its drop from rng seed s+i, so seeds overlap. Yaw 0, position only.", ""]
        res = {}
        with tempfile.TemporaryDirectory() as tmp:
            for rad in (0.12, 0.16):
                fold.GRASP_RADIUS = rad
                res[rad] = [(s + r["run"], r) for s in range(11, 21) for r in evaluate(10, s, tmp)]
        for rad, rr in res.items():
            rows = [r for _, r in rr]
            dist = {(round(r["dx"], 9), round(r["dy"], 9)) for r in rows}
            fresh = [r for k, r in rr if k not in used]
            fdist = {(round(r["dx"], 9), round(r["dy"], 9)) for r in fresh}
            L += [f"Patch {rad:.2f} m", "```", HEADER] + [f"s{k:<2} " + fmt(r) for k, r in rr] + ["", summary(rows),
                  f"distinct drops: {len(dist)} of {len(rows)} runs",
                  f"drops never drawn in seeds 6-10 (rng seed >= 20): {len(fdist)} distinct, {len(fresh)} runs, folded {nfolded(fresh)}/{len(fresh)}", "```", ""]
        L.append("Simulated, not a physical fold. Wrinkle is a proxy.")
        os.makedirs(out, exist_ok=True)
        open(os.path.join(out, "clean.md"), "w").write("\n".join(L) + "\n")
        print("\n".join(L))
        return 0
    if a.experiment:
        t0 = time.time()
        with tempfile.TemporaryDirectory() as tmp:
            fit, best, test = experiment(a.runs, tmp)
        n = a.runs * len(FIT_SEEDS)
        L = [f"Simulated towel fold, closed-loop relative controller (hand-set rule, not RL), {time.strftime('%Y-%m-%d')}.",
             "fold_target_y = mean(y_l, y_r) - D, from the perceived front corners. D = 0.30 reproduces the scripted -0.05 at the nominal drop.",
             "", f"Fit: seeds 1-5, {a.runs} runs each ({n} runs per D). Test: seeds 6-10, same N. D was fixed before any test run.",
             "", "| D | folded (fit) |", "|---|---|"]
        L += [f"| {D:.2f} | {nfolded(fit[D])}/{n} |" for D in D_GRID]
        L += ["", f"Chosen D = {best:.2f}", "", f"| policy (test seeds 6-10) | folded | mean time | mean wrinkle |", "|---|---|---|---|"]
        for k, rows in test.items():
            ran = [r for r in rows if r["result"] != "NOREACH"]
            L.append(f"| {k}{f' (D={best:.2f})' if k == 'relative' else ''} | {nfolded(rows)}/{len(rows)} | "
                     f"{np.mean([r['time'] for r in ran]) if ran else float('nan'):.1f} s | "
                     f"{np.mean([r['wrinkle'] for r in ran]) if ran else float('nan'):.3f} |")
        nor = {k: sum(r["result"] == "NOREACH" for r in rows) for k, rows in test.items()}
        L += ["", f"NOREACH (counted as failures): {nor}",
              "", "Simulated, not a physical fold. Wrinkle is a proxy. Randomisation: towel position only, yaw 0."]
        os.makedirs(out, exist_ok=True)
        open(os.path.join(out, "policy.md"), "w").write("\n".join(L) + "\n")
        print("\n".join(L))
        print(f"wall: {time.time() - t0:.0f} s")
        return 0
    if a.corners:
        with tempfile.TemporaryDirectory() as tmp:
            rows = corner_drops(tmp)
        print("   dx     dy    left(x,y)        right(x,y)       err_l  err_r  sep")
        for dx, dy, l, r, el, er, sep in rows:
            print(f"{dx:>6.2f} {dy:>6.2f}  ({l[0]:.3f},{l[1]:.3f})  ({r[0]:.3f},{r[1]:.3f})  {el:.4f} {er:.4f} {sep:.3f}")
        ok = sum(max(el, er) < 0.02 and sep > 0.6 for *_, el, er, sep in rows)
        print(f"pass: {ok}/9   worst error: {max(max(r[4], r[5]) for r in rows):.4f} m")
        return 0 if ok == 9 else 1
    if a.policy == "friction":
        return friction_table(a, out)
    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp:
        rows = evaluate(a.runs, a.seed, tmp, None if a.policy != "relative" else (a.D if a.D is not None else D_CHOSEN))
    pol = a.policy or "scripted"
    Dv = (a.D if a.D is not None else D_CHOSEN) if pol == "relative" else None
    head = (f"Simulated towel fold, {pol} policy" + (f" (D={Dv:.2f})" if Dv is not None else ", same fixed trajectory every run") +
            f". {a.runs} runs, seed {a.seed}, {time.strftime('%Y-%m-%d')}; no tuning, no train/test split (nothing is learned).")
    if a.policy:
        head = head.replace("; no tuning, no train/test split (nothing is learned)", "")
    lines = [head, "", HEADER] + [fmt(r) for r in rows] + ["", summary(rows)]
    lines += [f"  run {r['run']}: {r['why']}" for r in rows if r.get("why")]
    print("\n".join(lines))
    print(f"wall: {time.time() - t0:.1f} s ({(time.time() - t0) / max(a.runs, 1):.1f} s/run)")
    if a.policy:
        return 0
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "baseline.md"), "w") as f:
        f.write(f"{head}\n\n```\n" + "\n".join([HEADER] + [fmt(r) for r in rows]) + f"\n\n{summary(rows)}\n" + "".join(f"run {r['run']}: {r['why']}\n" for r in rows if r.get("why")) + "```\n"
                "\nWrinkle is a proxy: mean per-edge |length / rest length - 1| after the fold. "
                "Simulated, not a physical fold.\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
