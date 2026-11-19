# Brief 50 — why that one drop beats the dress

Implement task **10.3** only. The dress fails exactly one drop of nineteen: (dx −0.011, dy −0.024),
rng seed 22, failing the on-top check with width and depth passing. We can name it; we cannot yet say
why. Find the mechanism.

## Reproduce

`sim/eval.py --garment dress --policy arms --seed 12` (or whichever seed/run pair draws rng 22 —
s + i = 22). Confirm the failure and print the six numbers.

## Instrument

For that run, at the moment of release and after the settle:

- the per-vertex mean and min z of the **moved half** and the **stationary half**;
- where the hem edge lands in y, against the board front edge;
- how many vertices are over the board, on the rim, and past it;
- the max edge stretch, and whether the failing run's stretch differs from a passing run's.

Run the same instrumentation on a **passing** drop of your choice, and put the two side by side. The
diagnosis should fall out of the comparison, not from a guess.

## One paragraph

Write the finding into the README, under the dress row in "What is measured", in this shape:

> *The dress fails when it drops 24 mm toward the back: <the mechanism, with the two runs' numbers>.
> The other eighteen drops fold.*

If the mechanism is not clear from the comparison, say what the comparison ruled out and stop — do not
tune the fold to make the drop pass. A named mechanism is the goal; a fix is not.

## Acceptance

- The drop reproduces from the stated seed.
- The side-by-side numbers are printed.
- The README paragraph is written, or the honest "ruled out" is reported.
- The dress's other results are untouched; no eval is re-run at scale.

## Report

The two runs' numbers side by side, the mechanism in one sentence, and the README paragraph. Do not
commit.
