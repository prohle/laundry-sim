# Brief 35 — end flat, and stop a pile from passing

Revise **7.2**. The nominal run reports `stacked: board top + 155 mm`. That is not a folded garment; it
is cloth draped over the vertical flaps. The check let it through because "stacked" only had a floor.

## 1. End with everything flat

After the last fold and retract:

- release the clamp (bar up);
- retract **all four flaps to 0°** (flat), 400 steps each;
- settle 500 steps;
- then measure.

With the clamp released and friction at 0.25, the cloth should drop onto the board instead of riding
the flaps.

## 2. Bound the check

Replace the stacked condition with a band:

- `3 mm <= mean z - board top <= 40 mm`.

A 9-layer fold of 3 mm cloth is about 27 mm, so 40 mm is the ceiling for a believable stack. Print the
mean z and the band.

Keep area, on-centre, no NaN, inside the cabinet.

## 3. Faster iteration

Run the eval with **5 runs, seed 11** while tuning, then 10 runs only for the final number. State which
you ran.

## Acceptance

- The nominal towel reports mean z within the band and FOLDED.
- `check.py` passes all 20 checks.
- The eval reports a success rate as it is.

## Report

The per-step numbers, the final mean z, the eval table, and whether the flat retract dropped the cloth
or dragged it back. Do not commit.
