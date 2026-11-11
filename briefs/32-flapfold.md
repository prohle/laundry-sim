# Brief 32 — the fold, and the flap retracts

Implement task **7.2** only.

## The missing motion

Your `board_left180_top.png` shows the problem: the flap folds over and **stays there**, covering the
cloth. A folding board folds, then **retracts**, leaving the folded garment on the centre. Add the
retract to every fold:

```
drive_flap(name, 180)   # fold, 200 steps
hold 100 steps
drive_flap(name, 0)     # retract, 200 steps
hold 100 steps
```

The cloth must stay folded after the retract — it is resting on the centre panel, not on the flap.

## The check

The old width/depth check assumes a half fold. A tri-fold shrinks both axes, so replace it for the flap
program with:

- **area**: final footprint area <= 0.50 x initial area (a tri-fold in both axes gives about 0.11);
- **stacked**: mean garment z >= board top + 3 mm (it is a stack, not a flat sheet);
- **no NaN**.

Print all three numbers. Keep the old check for the arms path; do not delete it.

## The towel program

`sim/fold.py` (or a new `sim/flapfold.py`) runs:

1. `flap_left` fold + retract
2. `flap_right` fold + retract
3. `flap_front` fold + retract
4. `flap_back` fold + retract

Render `sim/out/flap_towel.png` from `top` after the retracts, and `sim/out/flap_towel_side.png` from
`side_l`.

## The run

```
sim/.venv/bin/python sim/flapfold.py --garment towel
sim/.venv/bin/python sim/eval.py --policy flaps --runs 10 --seed 11
```

Report the per-step area ratio and the final numbers. The success rate is whatever it is.

## Constraints

- Do not change the board geometry, the arms or the cameras.
- `check.py` gains `flapfold-towel`: the four-step program passes the new check.
- If a flap fails to retract without dragging the cloth back, report it — that is a real finding about
  the fold order, and the fix may be retracting only partway.

## Report

The per-step numbers, the two frames, the eval table, and whether the cloth survived the retracts.
Do not commit.
