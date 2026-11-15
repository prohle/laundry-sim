# Brief 44 — pants, shorts, dress on the half-fold program

Implement task **8.2** only. Task 8.1 (the tee clean test) is already running in the background; do not
touch the tee.

## What you are adding

Three garments on the **same program as the tee**: grasp `hem_l`/`hem_r`, lift, carry to the garment's
front edge minus 0.10 m, lower, release. The machinery (landmarks, program executor, three checks, eval)
already exists. The only new work is the garments and the wiring.

## Garment scaling (to fit the board, y −0.30..0.40, x 0.20..1.00)

| kind | now | new |
|---|---|---|
| pants | W 0.44, H 0.95, inseam 0.55 | **W 0.44, H 0.70, inseam 0.40** |
| shorts | W 0.44, H 0.55, inseam 0.28 | unchanged |
| dress | W 0.40, hem 0.70, H 1.00 | **W 0.40, hem 0.50, H 0.70** |

State in `garment.py`'s docstring that garments are scaled to the board.

## Program

`program.half_fold_program(kind)` generalises `tee_half_program`: the carry target is the garment's
front edge (its max-y landmark line) minus 0.10 m. For pants and the dress that is 0.30; for shorts
0.225. The tee's behaviour must not change (its target is already 0.30).

Landmarks: pants and shorts have `waist_l`/`waist_r` at the top and `hem_l`/`hem_r` at the bottom; the
dress has `shoulder_l`/`shoulder_r` and `hem_l`/`hem_r`. Grasp `hem_l`/`hem_r` in every case.

## Wiring

- `eval.py --garment {towel,tee,pants,shorts,dress}`; `--clean` runs the 100-run protocol (seeds 11–20)
  for any garment and writes `sim/out/<kind>-clean.md`.
- The width check stays `>= 0.85 × before` for every garment (the dress hem is wide; if the dress needs
  looser, report the number rather than loosening silently).

## Acceptance

```
sim/.venv/bin/python sim/garment.py --kind pants --out sim/out/pants.obj
sim/.venv/bin/python sim/fold.py --garment pants --policy arms
sim/.venv/bin/python sim/fold.py --garment shorts --policy arms
sim/.venv/bin/python sim/fold.py --garment dress --policy arms
```

All three print their six numbers. Then the clean protocol for each (this is ~50 minutes per garment;
run them sequentially and report — the tee's background run may still be going, that is fine).

## Report

The three nominal results, the three clean tables, and one sentence per garment on what failed if
anything did. Do not commit.
