# Brief 38 — no clamp, one flap, one honest test

Revise **7.2**. The clamp has caused every failure since it was added: it carries the cloth when it
lifts and drags it when it slides. Remove it from the fold path and test the simplest thing that can
work.

## Changes

1. **Rim back to 0.02 m high, 0.02 wide.** The 0.05 tray collides with the swinging flaps.
2. **No clamp in the fold.** The bar stays parked; it is not used.
3. **Flap–cloth friction 0.15.**
4. **One flap only: `flap_left`.** Fold to 180° over 400 steps, hold 200, retract to 90° over 400,
   settle 500. Then flatten all flaps to 0° over 400 each, settle 500.
5. Measure after the settle.

## What we are testing

Does a low-friction flap, retracted to vertical, leave the cloth on the centre panel without a clamp?
If yes, the clamp was unnecessary and the sequence can be rebuilt without it. If no, the board
mechanism needs a hold that is not friction — and that is a design change for the PM to decide, not
another tuning pass.

## Run

```
sim/.venv/bin/python sim/flapfold.py --garment towel --steps left
```

`--steps left` runs only the left fold. Print: area before/after, mean z, on-centre, vertices below
board, and a frame from `top`.

Then `--garment towel` (all four) once, and report.

## Acceptance

- One flap: the cloth is on the centre with mean z within 3–40 mm of the board, on-centre >= 60%.
- All four: report as it is.
- Do not touch the arms path.

## Report

The one-flap numbers and frame, the four-flap numbers, and one sentence: is a clamp needed? Do not
commit.
