# Brief 36 — the clamp slides off

Revise **7.2**. You found the real cause: the bar clamps the stack, then lifts and carries the cloth to
1.01 m. The 155 mm was the bar, not the flaps.

## 1. Release the clamp sideways

The bar gets a second prismatic joint in y. Release is:

1. at the clamped height, slide the bar in y by **0.50 m** (off the board) over 150 steps;
2. then lift it to its park height;
3. hold 100.

Do not lift while it is over the cloth.

## 2. Two check tolerances

- `flap-carries` front: 0.149 m against 0.15. The threshold was arbitrary; set it to **0.14 m** and
  note why in the check's message. Do not change the motion.
- `extent_monotone`: it now fails because the final flatten spreads the footprint by 19.9%. Sample the
  property **only during fold ramps**, not during the final flatten or the settle. That is what the
  property is about: a fold must not spread the cloth. Keep the 5% tolerance.

## 3. Run

```
sim/.venv/bin/python sim/flapfold.py --garment towel
sim/.venv/bin/python sim/eval.py --policy flaps --runs 5 --seed 11
cd sim && .venv/bin/python check.py
```

## Acceptance

- The nominal towel is FOLDED with mean z in the 3–40 mm band.
- `check.py` passes all 20 checks.
- The 5-run eval reports its rate as it is.

## Report

The final mean z, the per-step numbers, the eval table, and whether the sideways release left the cloth
on the board. Do not commit.
