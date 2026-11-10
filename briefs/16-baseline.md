# Brief 16 — re-solve the trajectory, then report the baseline

Implement task **3.4**. The base moved to y = -0.08 and the old trajectory now asks the upper joint
for -2.403 rad, 0.003 past its -2.4 limit.

## 1. Make the baseline position-only

In `sim/eval.py`, `drop()` still draws yaw ±20°. The spec (3.3) now says **yaw = 0** for the baseline,
position ±0.04 m. Change it. Update the docstring that still describes PCA.

## 2. Re-solve the fold trajectory

The phases stay: ready, close, lift, carry in y to -0.05, lower, release, settle.

Re-solve the joint targets for the new base. If a joint limit is hit:

- first try lifting higher before the carry;
- then try the inward x move (move both pinch points toward the cabinet centre after the lift, undo
  before release, or lower-and-release while still inward);
- do not widen joint ranges, do not move the base again, do not lengthen links.

Print which adjustment was needed and the max |joint| over the trajectory.

## 3. Run the baseline

```
sim/.venv/bin/python sim/eval.py --runs 10 --seed 1
```

Write the table to `sim/out/baseline.md` with the seed and the date. Report the success rate exactly as
it comes out. Do not tune after seeing it.

## Acceptance

- No `NOREACH`.
- `check.py` passes all checks.
- Same seed twice gives identical numbers.

## Report

The adjustment used, the max |joint|, the baseline table, the success rate, mean time, mean wrinkle,
and for each failure which of width/depth/on-top failed. Do not commit; the PM reviews first.
