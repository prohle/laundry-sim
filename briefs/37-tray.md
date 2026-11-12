# Brief 37 — release without touching, and a deeper tray

Revise **7.2**, last attempt on this mechanism. Two changes only.

## 1. The clamp lifts before it slides

Sliding a clamped bar drags the cloth. Release in three moves:

1. **lift the bar 3 mm** (from clamp height 0.713 to 0.716) — it stops pressing;
2. **slide it in y by 0.50 m** at that height — it passes over the cloth, not through it;
3. **lift to park**.

The bar still holds during the flap retract; it only releases after the retract.

## 2. The rim becomes a tray

Raise the rim from 0.02 to **0.05 m** and widen it to 0.03. The board is a shallow tray, not a flat
panel. That stops the cloth leaving the board during folds. It is a machine detail, stated as such.

## 3. Run

```
sim/.venv/bin/python sim/flapfold.py --garment towel
sim/.venv/bin/python sim/eval.py --policy flaps --runs 5 --seed 11
cd sim && .venv/bin/python check.py
```

## 4. If it still fails

Report the numbers and stop. Do not try a third release strategy in this turn. The honest fallback is
in the next brief and the PM decides it.

## Acceptance

- The nominal towel is FOLDED with mean z in the 3–40 mm band and on-centre >= 60%.
- `check.py` passes all 20 checks.
- The 5-run eval is reported as it is.

## Report

The final mean z, on-centre, vertices below the board, the eval table, and one sentence on which change
mattered. Do not commit.
