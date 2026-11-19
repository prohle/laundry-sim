# Brief 51 — the margin sweep

Implement task **10.4**. Your 10.3 paragraph is falsified and must be replaced before it is committed.

## What the table already proved

All 19 distinct dress drops, sorted by dy: **nine start with the hem past the board's back edge and
all nine fold**, including dy = −0.040 (rng 25, the most extreme back-shift). The failing drop
(rng 22, dy = −0.024) is not the most extreme anything. "The only drop where the hem starts past the
back edge" is wrong; do not restate it anywhere.

## The sweep

Extend `sim/diag_dress.py` to run all 19 distinct drops (rng 11–29) and print one row each:

```
rng   dx      dy      margin_mm   moved_min_z   still_min_z   sag_half   result
```

- `margin_mm` is the on-top margin you already compute (moved mean z − stationary mean z, in mm).
- `sag_half` is which half owns the front-edge drape (the half with the lower min z), from your 10.3
  instrumentation.
- ~19 runs at ~30 s each; keep the whole sweep under 15 minutes.

## The README paragraph

Replace your 10.3 paragraph in `README.md` with what the sweep shows, in this shape:

> *The dress's hem drapes over the board's front edge in every run; which half carries that drape
> varies with the drop. The on-top margin across the 19 distinct drops is <min>–<max> mm, median
> <median>, against a 3 mm threshold — <n> drops clear it by less than 5 mm. The failing drop's
> margin is 1.7 mm, 1.3 mm short. The other eighteen clear it.*

Use the actual numbers. If the distribution says something sharper — a correlation with dx, or the
sag-half flipping at a boundary — say that instead. Do not tune the fold; do not re-run any eval at
scale.

## Acceptance

- The 19-row table prints.
- The README paragraph is rewritten with the sweep's numbers.
- `check.py` is unaffected; nothing else changes.

## Report

The 19 rows, the distribution in one line (min/median/max), what the mechanism actually is in your
one-sentence judgement, and the new README paragraph. Do not commit.
