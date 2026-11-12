# Brief 33 — retract to vertical, hold the fold

Revise **7.2**. The fold works; the retract destroys it, and 8 of 10 runs blow up.

## 1. Retract to 90°, not 0°

A flap at 180° lies on the centre with the cloth under it. Sweeping it back to 0° drags the cloth the
whole way. Retract to **90°** (vertical), which lifts the flap off the cloth and stops. The flap stays
vertical, out of the way, until the next fold.

## 2. Slow the sweep

A 180° rotation in 200 steps at 4 ms is 0.8 s; the cloth is being flung. Use **400 steps** for each
fold and each retract, and hold 200 between. If the cloth still leaves the cabinet, halve the timestep
to 0.002 and say so.

## 3. If it still drags, hold the fold with the bar

Only if 1 and 2 fail: after the fold reaches 180°, lower the smoothing bar onto the centre (bar bottom
at z = 0.713), hold 100 steps, retract the flap to 90°, then lift the bar. The bar is a clamp; widen it
to 0.60 x 0.12 so it presses a strip, not a line.

## 4. The check

Keep the three conditions, and add the one you proposed:

- **on centre**: at least 60% of the cloth's vertices are within the centre panel's x/y bounds after
  the final retract.
- area <= 0.50, stacked >= 3 mm, no NaN, no vertex outside the cabinet.

A heap that passes area but fails on-centre is not a fold.

## 5. Fix the props failure

`extent_monotone` reports seed 1 growing 2.1 cm. Check whether the board change caused it. If the arms
path is unchanged and the property is just too tight for the new board height, say so and raise the
tolerance to 3 cm with a comment — do not delete the property.

## The run

```
sim/.venv/bin/python sim/flapfold.py --garment towel
sim/.venv/bin/python sim/eval.py --policy flaps --runs 10 --seed 11
```

## Acceptance

- `check.py` passes all checks, including `props`.
- The towel program reports the four steps and the final numbers.
- The eval reports a success rate; report it as it is, including 0/10.

## Report

The per-step numbers, the eval table, whether you needed the bar, the timestep, and the two frames.
Do not commit.
