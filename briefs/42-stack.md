# Brief 42 — keep the tee stack on the board

Finish task **7.7**. The tee fails one of three checks, and the cause is in the numbers:

```
width  0.788 -> 0.789  ok
depth  0.695 -> 0.274  ok
on top: moved mean z 0.6969, still 0.7106  FAIL  (moved half is below the board top, 0.71)
final y-centre 0.321  max edge stretch 1.15
```

The fold line y = 0.40 is the board's front edge. The doubled cloth lands on that edge, drapes over
it, and hangs below the board. Carry the stack inside the board instead.

## Changes

1. `tee_half_program`: `carry_to_y = 0.30` (default and CLI). The hem edge lands 0.10 m inside the
   board; the footprint still spans the same 0.35 m, so the depth check is unaffected.
2. `lower_z = 0.72` (from 0.73), so the release drops the cloth 1 cm onto the stack rather than 2.

Do not change the arms, the board, the grasp or the checks.

## Run

```
sim/.venv/bin/python sim/fold.py --garment tee --policy arms
sim/.venv/bin/python sim/eval.py --garment tee --policy arms --runs 5 --seed 11
```

## Acceptance

- The nominal tee passes all three checks, with the moved half at least 3 mm above the stationary
  half and no vertices below the board top other than minor drape (report the count).
- The 5-run eval is reported as it is.
- The towel is unchanged: run `sim/fold.py --garment towel --policy arms` once and confirm FOLDED.
  (A full `--clean` re-run is not needed this turn; the towel path was not touched.)

## Report

The six numbers, the eval table, the below-board vertex count, the frame from `top`, and whether the
edge stretch dropped below 1.10. Do not commit.
