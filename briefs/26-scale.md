# Brief 26 — scale the machine

Implement task **5.8** only. The T-shirt gate found the real limit: the machine is smaller than a
shirt. Fix the machine before touching the program again.

## New geometry

| part | now | new |
|---|---|---|
| cabinet | 0.80 × 0.60 × 1.10 | **1.20 × 0.80 × 1.40** |
| shelf top | 0.56 | **0.70** |
| upper link | 0.24 | **0.35** |
| forearm | 0.20 | **0.30** (reach 0.65) |
| shoulder bases | (0.05/0.75, −0.08, 0.75) | **(0.15/1.05, −0.10, 0.95)** |
| towel | 0.70 × 0.40 | unchanged, centred on the shelf |
| tee | 0.40 × 0.60 | **0.50 × 0.70**, sleeves 0.20, depth 0.18 |

The garment is centred on the shelf; the hem and shoulders must both be within 0.65 m of a shoulder
base.

## What to re-solve

- The ready pose for the new bases.
- The towel fold trajectory (`fold.py`), so the towel still folds.
- `Z_LIFT`, `Z_LOWER` and the inward distance, from the joint-limit scan, not by trial.

## Acceptance

- `sim/eval.py --clean` still gives **55/55** on the unseen drops for patch 0.16 (the towel must not
  regress).
- For the tee: grip-to-landmark distance < 0.08 m at all four landmarks (`hem_l`, `hem_r`, `shoulder_l`,
  `shoulder_r`) across the 9 position drops. Print the table.
- `check.py` passes.

## Constraints

- Do not change the fold checks, the grasp mechanics or the drop range.
- If the towel cannot be re-solved to 55/55, report the new number and the joint that limits it — that
  would be a finding, not a failure to hide.
- One pass on the trajectory; if it does not converge, report the best number.

## Report

The new joint-limit scan, the towel result, the tee reach table, and the frame `sim/out/arms.png`.
Do not commit.
