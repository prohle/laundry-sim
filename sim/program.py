"""Fold programs (task 5.5): a fold is a list of steps, each with its own check. Simulated; the grasp is kinematic.

Step = {
  "name": str,
  "grasp": [left, right],        # each a landmark name (e.g. "corner_l") or a world (x, y)
  "lift_z": float,               # pinch z while carrying
  "carry": (dx, dy),             # world move while lifted, per arm, relative to the grasp point
  "carry_to_y": float,           # optional: absolute pinch y instead of the dy in "carry"
  "inward": float,               # optional: both pinches move this far toward the cabinet centre after the lift
  "lower_z": float,
  "release": True,
  "front_only": True,            # optional: hold only vertices in front of the initial fold line (default True)
  "body_x": (lo, hi),            # sleeve_inside only: world x-range of the body
  "check": "halves_overlap",     # optional name in CHECKS
}
run_program(m, program, ...) -> {"steps": [{"name", "ok", "numbers"}], "folded": bool, "time": s, ...fold.run keys}
"""
import numpy as np

import fold

OVERLAP_MIN = 0.60


def resolve(g, landmarks):
    """A landmark name or an (x, y[, z]) tuple -> numpy array."""
    return np.asarray(landmarks[g] if isinstance(g, str) else g, dtype=float)


def halves_overlap(pre, post, ctx, step):
    """The moved half's interval on the fold axis (y) overlaps the stationary half's by >= 60% of the moved interval."""
    mv, st = post[~ctx["half_low"], 1], post[ctx["half_low"], 1]
    lo, hi = max(mv.min(), st.min()), min(mv.max(), st.max())
    frac = max(0.0, hi - lo) / max(mv.max() - mv.min(), 1e-9)
    return frac >= OVERLAP_MIN, dict(overlap=float(frac), min=OVERLAP_MIN)


def sleeve_inside(pre, post, ctx, step):
    """Vertices outside the body's x-range before the step are inside it after (margin 0)."""
    lo, hi = step["body_x"]
    sl = (pre[:, 0] < lo) | (pre[:, 0] > hi)
    out = int(((post[sl, 0] < lo) | (post[sl, 0] > hi)).sum())
    return out == 0, dict(sleeve_verts=int(sl.sum()), still_outside=out)


CHECKS = {"halves_overlap": halves_overlap, "sleeve_inside": sleeve_inside}


def towel_program(y_fold=None):
    """The towel fold as a one-step program. Same numbers as the single-trajectory path in fold.run."""
    return [dict(name="fold_half", grasp=["corner_l", "corner_r"], lift_z=fold.Z_LIFT, carry=(0.0, 0.0),
                 carry_to_y=fold.Y_FOLD if y_fold is None else y_fold, inward=fold.INWARD,
                 lower_z=fold.Z_DOWN, release=True, check="halves_overlap")]


def tee_program(dx=0.0, inward=0.17, lift_z=fold.Z_LIFT):
    """T-shirt, two steps (task 5.6): both sleeves in, then the body in half. Body x-range is the lay-down 0.20-0.60 shifted by the drop."""
    return [dict(name="sleeves_in", grasp=["sleeve_l", "sleeve_r"], lift_z=lift_z, carry=(0.0, 0.0), inward=inward,
                 lower_z=fold.Z_DOWN, release=True, body_x=(0.20 + dx, 0.60 + dx), check="sleeve_inside"),
            dict(name="body_half", grasp=["hem_l", "hem_r"], lift_z=lift_z, carry=(0.0, 0.0), carry_to_y=0.25,
                 lower_z=fold.Z_DOWN, release=True, front_only=False, check="halves_overlap")]


def run_program(m, program, **kw):
    """Execute the steps in order. kw is passed to fold.run (corners, trace, render, on_step, landmarks)."""
    return fold.run(m, program=program, **kw)
