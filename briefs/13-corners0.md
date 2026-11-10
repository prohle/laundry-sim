# Brief 13 — yaw 0 baseline: corners, then reach, then the number

You were right on both counts: at ±20° the front corners cannot share a y, and my pass condition was
impossible. The spec is narrowed: **the baseline randomises position only (±0.04 m), yaw = 0.** Yaw is
task 3.6, later.

Do **3.5 first** and stop. Then 3.4 next turn.

## 3.5 — corners at yaw 0

- Targets: the max-y vertex with `x < centroid_x`, and the max-y vertex with `x > centroid_x`.
- Ground truth is known from the drop parameters: the true front corners are the two rectangle
  corners at max y. Compare each target to the truth.
- 9 drops: dx, dy each in {-0.04, 0, 0.04}. Print `dx dy left(x,y) right(x,y) err_l err_r sep`.
- Pass: each error < 0.02 m and sep > 0.6 m, 9/9.
- Replace the old `front_corners` rule.

## Then stop

Do not touch the trajectory. Do not run the eval. Do not start 3.4.

## Acceptance

- 9/9 pass, table printed.
- `check.py` passes 11 checks; add `corners-front` (one drop, assert the targets are within 0.02 m of
  the true corners).

## Report

The 9-row table, the worst error, and whether the old PCA rule would also have passed (you said you
had not measured it — measure it now, cheaply, and say which rule is better).
Do not commit; the PM reviews first.
