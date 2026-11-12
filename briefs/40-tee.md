# Brief 40 — a T-shirt in half, with the arms

Add task **7.7**. The board and blade crumple a 3 mm floppy cloth; that is a finding, not a path. The
arms already fold a towel at 55/55. This brief asks whether they can fold a **real garment** in half.

## The garment

Tee, 0.50 x 0.70, sleeves 0.20, on the board (or the shelf — use whichever the arms can reach; the
board is flat, so the board).

## The fold

1. Grasp the two **hem** corners (`hem_l`, `hem_r`).
2. Lift to z = 0.85.
3. Carry in y to the fold line at the garment's mid-height (world y ≈ 0.05).
4. Lower to z = 0.73, release, settle 500.

That is a half fold: hem to shoulders.

## The check

The same three numbers as the towel, on the tee's footprint:

- width after >= 0.85 x before (the sleeves make this looser than the towel's 0.90);
- depth after <= 0.60 x before;
- moved half at least 3 mm above the stationary half.

Print all six numbers.

## Run

```
sim/.venv/bin/python sim/fold.py --garment tee --policy arms
sim/.venv/bin/python sim/eval.py --garment tee --policy arms --runs 5 --seed 11
```

## Acceptance

- The nominal tee folds, or the numbers say why not.
- The eval reports its rate as it is.
- The towel still folds 55/55 (do not regress it).

## Report

The six numbers, the eval table, the frame from `top`, and whether the sleeves interfered. Do not
commit.
