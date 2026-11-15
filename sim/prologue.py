"""Task 9.1: square and align prologue for the tee on the board, then one four-flap retail fold. Simulated.

square: arms grasp shoulder_l/shoulder_r, lift to pinch z 0.74, hold 500 steps, lower to 0.72, release.
align:  the left fold line (x midway between hem_l and shoulder_l) must be within 1 cm of the left hinge
        (x = 0.467). If not, the arms grasp the hem corners and carry in x by the offset, then release.
        (Run 1 failed on reach for the right hem; the committed run grasps the shoulders instead.)
Then flapfold.run: left, right, front, back, with the clamp. One configuration, no tuning.
"""
import os
os.environ.setdefault("MUJOCO_GL", "egl")

import sys
import tempfile

import mujoco
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import flapfold
import fold
import garment
import scene

KIND = "tee"
HINGE_X = scene.CX - scene.BW / 2     # left hinge, 0.4667
TOL = 0.01
SQUARE_Z, LOWER_Z, SQUARE_HOLD = 0.74, 0.72, 500


def line_x(pos, idx):
    """x of the left fold line: midway between hem_l and shoulder_l."""
    return float((pos[idx["hem_l"], 0] + pos[idx["shoulder_l"], 0]) / 2)


def main():
    verts, _, _ = garment.build(KIND)
    lm_local = garment.build_full(KIND)[3]
    idx = {n: int(np.argmin([(v[0] - x) ** 2 + (v[2] - z) ** 2 for v in verts])) for n, (x, z) in lm_local.items()}
    with tempfile.TemporaryDirectory() as tmp:
        m = flapfold.model_for(KIND, tmp)
        d0 = mujoco.MjData(m)
        mujoco.mj_forward(m, d0)
        pos0 = np.array(d0.flexvert_xpos)
        a_orig = flapfold.hull_area(pos0)

        def xy(names, pos):
            return [tuple(pos[idx[n], :2]) for n in names]

        info = {}

        def align(pos):
            off = HINGE_X - line_x(pos, idx)
            info["before"] = off
            print(f"align: fold line x {line_x(pos, idx):.4f}, hinge {HINGE_X:.4f}, offset before {off * 1000:+.1f} mm")
            if abs(off) <= TOL:
                return None
            # Deviation from the brief, recorded in the report: the right hem corner at x + 0.12 is at arm r's shoulder-yaw limit
            # (2.702 > 2.7 rad, first run), so align grasps the shoulders, which are at y 0.40 and reachable.
            hl, hr = xy(("shoulder_l", "shoulder_r"), pos)
            return dict(grasp=[hl, hr], carry=(off, 0.0))

        prog = [
            dict(name="square", grasp=["shoulder_l", "shoulder_r"], lift_z=SQUARE_Z, carry=(0.0, 0.0), hold=SQUARE_HOLD,
                 lower_z=LOWER_Z, release=True, front_only=False, settle=200),
            dict(name="align", dynamic=align, grasp=["shoulder_l", "shoulder_r"], lift_z=SQUARE_Z, carry=(0.0, 0.0),
                 lower_z=LOWER_Z, release=True, front_only=False, settle=200),
        ]
        cs = [pos0[idx["shoulder_l"]].copy(), pos0[idx["shoulder_r"]].copy()]
        lm = {n: tuple(pos0[i, :2]) for n, i in idx.items()}
        keep = []
        r = fold.run(m, program=prog, corners=cs, landmarks=lm, kind=KIND, whole_checks=False, keep=keep)
        d = keep[0]
        for s in r["steps"]:
            print(f"prologue step {s['name']}: ok {s['ok']} {s['numbers']}")
        pos = np.array(d.flexvert_xpos)
        after = HINGE_X - line_x(pos, idx)
        print(f"align offset: before {info.get('before', float('nan')) * 1000:+.1f} mm, after {after * 1000:+.1f} mm "
              f"({'within' if abs(after) <= TOL else 'outside'} 1 cm); hull area {a_orig:.4f} -> {flapfold.hull_area(pos):.4f} m2; nan {r['nan']}")
        if r["nan"] or not all(s["ok"] for s in r["steps"]):
            print("PROLOGUE FAILED, no flap retry"); return 1
        f = flapfold.run(m, d=d, bar=True)
        f = {**f, **flapfold.summarise(f["data"], f["a0"])}
        print("flap retry (left, right, front, back; clamp on; prologue on):")
        flapfold.report(f)
        print("FOLD" if flapfold.is_fold(f) else "NO FOLD", "(simulated)")
        flapfold.render(m, f["data"], "top", os.path.join(flapfold.OUT, "prologue_tee.png"))
        return 0 if flapfold.is_fold(f) else 1


if __name__ == "__main__":
    sys.exit(main())
