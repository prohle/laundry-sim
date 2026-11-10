# Brief 10 — make the carry reachable, then report the honest number

Implement task **3.4**. The 0/10 is a reach failure: the carry path drives the shoulder past its
±2.2 rad limit in every run. Fix the path, not the machine and not the randomisation.

## What to change

In the fold trajectory:

- **Lift first, carry second.** Raise both corners vertically to z = 0.72 *before* moving in y, so the
  pinch point does not sweep through the shoulder column at low height.
- **Carry at the highest reachable z**, then lower.
- Keep the same start (ready pose), the same fold target (y = -0.05), and the same release.
- If a joint limit is still hit anywhere in yaw ±20°, offset ±0.04 m, report which joint, the yaw and
  offset that hit it, and stop. Do not widen the joint range.

## What not to change

- The joint ranges. The arm is the machine; the trajectory is the software.
- The randomisation range in `eval.py`.
- The fold check (width, depth, on top).

## Then report the baseline

```
sim/.venv/bin/python sim/eval.py --runs 10 --seed 1
```

Print the full table. The success rate is whatever it is — 3/10, 6/10, 10/10. Do not tune the
trajectory after seeing the number. If you are tempted to adjust it, stop and report instead.

Write the table to `sim/out/baseline.md` with the seed and the date.

## Acceptance

- No `NOREACH` in the table.
- `check.py` still passes 11 checks (including `eval-reproducible`).
- The same seed twice gives identical numbers.

## Report

The table, the success rate, mean time, mean wrinkle, and for each failure whether it was depth, width
or on-top. Do not commit; the PM reviews first.
