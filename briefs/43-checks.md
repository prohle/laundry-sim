# Brief 43 — two failing checks, both marginal

Fix the two failing checks in `sim/check.py`. Investigate before loosening either.

## 1. `flap-carries` — 3.8 mm against an arbitrary 5 mm

The front flap carries its cloth section 3.8 mm over the panel; the check demands 5 mm. The 5 mm was
chosen when the check was written, not measured. Do two things:

- print, in the check's message, the measured lift for all four flaps;
- if the other three are comfortably above 5 mm and only the front is at 3.8, lower the threshold to
  **3 mm** with a comment: the front flap has the least overhang, so it lifts the least cloth.

If the front flap's carry has dropped since 7.1 — compare with the numbers in that task's report — say
so instead, because that would be a regression in the board, not a threshold.

## 2. `props extent_monotone` — 8.5% growth on seed 2

The property says a fold must not spread the cloth. It was written when the towel lay on a flat shelf;
the cloth now lies on a board with a rim, and the tee folds too.

Find where the 8.5% growth happens:

- if it is during the **settle after release**, the property is sampling the wrong phase: restrict the
  sampling to the lift-and-carry, where a fold actually happens, and keep the 5% tolerance;
- if it is during the **fold itself**, that is real spread — raise the tolerance to 10% with a comment
  naming seed 2 and the measured growth, and report the growth for the towel and the tee separately.

Do not delete the property.

## Acceptance

```
cd sim && .venv/bin/python check.py
```

`VERDICT: PASS (20 checks)`. Both checks print their measured numbers.

## Report

The four flap lifts, where the 8.5% growth occurred, which fix you applied and why, and the full check
output. Do not commit.
