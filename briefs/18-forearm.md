# Brief 18 — 3 cm more forearm

Implement task **4.4** only.

## Why

The held-out failures miss the depth threshold by 1–9 mm (0.61–0.69 against 0.60). The reach limit is
0.44 m; the farthest corner is 0.372 m. Three centimetres more forearm should let the fold target go
further back without hitting the limit.

## What to change

- Forearm length 0.20 → **0.23 m** in `sim/arms.py`.
- Re-solve the ready pose and the fold trajectory for the longer forearm. The inward move stays
  0.12 m; if a different value is needed, report it.
- Keep the shoulder base at (0.05, -0.08, 0.75) and (0.75, -0.08, 0.75), the upper link 0.24 m, the
  joint ranges and the cabinet.

## What not to change

- The fold check (width, depth, on top).
- The drop randomisation (position only, ±0.04 m, yaw 0).
- The depth threshold.

## The run

```
sim/.venv/bin/python sim/eval.py --policy scripted --runs 10 --seed 6   # 5 seeds = 50 runs
```

Compare against the baseline: **32/50** on the same seeds. Report the new table and the delta.

If it is worse, say so and stop — do not try a second length. If it is better, say by how much.

## Acceptance

- The held-out table is printed and written to `sim/out/forearm.md`.
- `check.py` passes all checks.
- `sim/fold.py` still prints FOLDED on the nominal towel.

## Report

The table, the success rate, the delta from 32/50, the max |joint| over the trajectory, and whether
any run now fails on width or on-top rather than depth. Do not commit; the PM reviews first.
