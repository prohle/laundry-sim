"""Task 10.3: instrument one dress half-fold drop at release and after the settle. Simulated.
usage: diag_dress.py <rng_seed> [<rng_seed> ...]   (run i uses default_rng(seed); eval.py names it s + i)"""
import os
os.environ.setdefault("MUJOCO_GL", "egl")
import sys
import tempfile

import mujoco
import numpy as np

import eval as E
import fold
import garment
import program
import scene

KIND = "dress"
BX0, BX1, BY0, BY1, RIM = 0.60 - 0.40, 0.60 + 0.40, 0.05 - 0.35, 0.05 + 0.35, 0.02


def board_count(p):
    x, y = p[:, 0], p[:, 1]
    inside = (x >= BX0 + RIM) & (x <= BX1 - RIM) & (y >= BY0 + RIM) & (y <= BY1 - RIM)
    past = (x < BX0) | (x > BX1) | (y < BY0) | (y > BY1)
    return int(inside.sum()), int((~inside & ~past).sum()), int(past.sum())


def run_one(rs, tmp):
    yaw, dx, dy = E.drop(np.random.default_rng(rs))
    obj = os.path.join(tmp, "g.obj")
    E.posed_obj(obj, yaw, dx, dy, KIND)
    m = mujoco.MjModel.from_xml_string(scene.build(obj, KIND))
    d = mujoco.MjData(m)
    mujoco.mj_forward(m, d)
    ox, oy = scene._offset(KIND)
    pos = np.array(d.flexvert_xpos)
    lm = {n: (ox + x + dx, oy + z + dy) for n, (x, z) in garment.build_full(KIND)[3].items()}
    cs = [pos[np.argmin(np.hypot(pos[:, 0] - lm[n][0], pos[:, 1] - lm[n][1]))].copy() for n in ("hem_l", "hem_r")]
    verts, faces, _ = garment.build(KIND)
    e = np.array(sorted({tuple(sorted((f[i], f[(i + 1) % 3]))) for f in faces for i in range(3)}))
    vv = np.array(verts)
    rest = np.linalg.norm(vv[e[:, 0]] - vv[e[:, 1]], axis=1)
    snaps = {}

    def on_step(dd, k):
        p = np.array(dd.flexvert_xpos)
        if k == 1:
            snaps["p1"] = p
            import arms
            snaps["gap"] = [np.round(arms.pinch(m, dd, sd)[:2] - c[:2], 4).tolist() for sd, c in zip(arms.SIDES, cs)]
            snaps["corner_y"] = [round(float(c[1]), 4) for c in cs]
        if k in (500, 550, 1050):               # end of lower (still held), after release+retract, after settle
            snaps[k] = p
    prog = program.half_fold_program(KIND)
    r = program.run_program(m, prog, corners=cs, landmarks=lm, kind=KIND, width_min=fold.TEE_WIDTH_MIN, moved_low=True, top_min=fold.TEE_TOP_MIN, on_step=on_step)
    p1 = snaps["p1"]
    ymid = (p1[:, 1].min() + p1[:, 1].max()) / 2
    low = p1[:, 1] < ymid                       # moved half (moved_low=True)
    hem = p1[:, 1] <= p1[:, 1].min() + 0.02
    out = dict(rs=rs, dx=dx, dy=dy, r=r, gap=snaps["gap"], corner_y=snaps["corner_y"], steps=sorted(k for k in snaps if isinstance(k, int) and k > 1), rows=[])
    for k in out["steps"]:
        p = snaps[k]
        st = (np.linalg.norm(p[e[:, 0]] - p[e[:, 1]], axis=1) / rest)
        out["rows"].append(dict(k=k, zm_mean=p[low, 2].mean(), zm_min=p[low, 2].min(), zs_mean=p[~low, 2].mean(), zs_min=p[~low, 2].min(),
                                hem_y=p[hem, 1].mean(), hem_ymin=p[hem, 1].min(), hem_ymax=p[hem, 1].max(), hem_z=p[hem, 2].mean(),
                                board=board_count(p), stretch=st.max(), stretch_mean=st.mean(),
                                below=int((p[:, 2] < 0.71).sum()), ymin=p[:, 1].min(), ymax=p[:, 1].max()))
        pst = (p[:, 0] < BX0) | (p[:, 0] > BX1) | (p[:, 1] < BY0) | (p[:, 1] > BY1)
        lo = p[:, 2] < 0.70
        q = out["rows"][-1]
        q["past_moved"], q["past_still"] = int((pst & low).sum()), int((pst & ~low).sum())
        q["low_moved"], q["low_still"] = int((lo & low).sum()), int((lo & ~low).sum())
        q["low_xy"] = [(round(float(a), 3), round(float(b), 3)) for a, b in p[lo][:, :2][:6]]
        hl, hr = hem & (p1[:, 0] < p1[hem, 0].mean()), hem & (p1[:, 0] >= p1[hem, 0].mean())
        q["hem_l_y"], q["hem_r_y"] = float(p[hl, 1].mean()), float(p[hr, 1].mean())
    return out


def sweep(tmp):
    """Task 10.4: on-top margin for the 19 distinct drops (rng 11-29). Min z are after the settle (step 1050)."""
    print("rng   dx      dy      margin_mm   moved_min_z   still_min_z   sag_half   result")
    ms = []
    for rs in range(11, 30):
        o = run_one(rs, tmp)
        r, q = o["r"], o["rows"][-1]
        mg = (r["z_moved"] - r["z_still"]) * 1000
        ms.append(mg)
        sag = "moved" if q["zm_min"] < q["zs_min"] else "still"
        print(f"{rs:<5} {o['dx']:+.3f}  {o['dy']:+.3f}  {mg:9.1f}   {q['zm_min']*1000:11.1f}   {q['zs_min']*1000:11.1f}   {sag:<8}   {'FOLDED' if r['folded'] else 'FAILED'}", flush=True)
    a = np.array(ms)
    print(f"margin_mm min {a.min():.1f} median {np.median(a):.1f} max {a.max():.1f}; <5 mm: {int((a < 5).sum())}; <3 mm: {int((a < 3).sum())}")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory() as tmp:
        if sys.argv[1:] == ["--sweep"]:
            sweep(tmp)
            sys.exit(0)
        for rs in map(int, sys.argv[1:]):
            o = run_one(rs, tmp)
            r = o["r"]
            print(f"\n== rng {o['rs']} dx {o['dx']:+.4f} dy {o['dy']:+.4f}  {'FOLDED' if r['folded'] else 'FAILED'}")
            print(f"six: x {r['x0']:.3f}->{r['x1']:.3f}  y {r['y0']:.3f}->{r['y1']:.3f}  z_moved {r['z_moved']:.4f} z_still {r['z_still']:.4f}  "
                  f"w {int(r['width_ok'])} d {int(r['depth_ok'])} t {int(r['top_ok'])}  stretch {r['stretch']:.3f}")
            print(f"pinch minus corner (xy, l/r) at grasp: {o['gap']}   corner y {o['corner_y']}   hem row y {o['rows'][0]['hem_ymin']:.3f}")
            for q in o["rows"]:
                print(f"step {q['k']:>4}: moved z mean {q['zm_mean']*1000:.1f} min {q['zm_min']*1000:.1f} | still z mean {q['zs_mean']*1000:.1f} min {q['zs_min']*1000:.1f} (mm) | "
                      f"hem y {q['hem_y']:.3f} [{q['hem_ymin']:.3f},{q['hem_ymax']:.3f}] z {q['hem_z']*1000:.1f} | y range {q['ymin']:.3f}..{q['ymax']:.3f} | "
                      f"inside/rim/past {q['board']} | max stretch {q['stretch']:.3f} mean {q['stretch_mean']:.4f} | below board {q['below']}")
                print(f"      past board moved/still {q['past_moved']}/{q['past_still']}  z<0.70 moved/still {q['low_moved']}/{q['low_still']} at xy {q['low_xy']}  hem_l y {q['hem_l_y']:.3f} hem_r y {q['hem_r_y']:.3f}")
