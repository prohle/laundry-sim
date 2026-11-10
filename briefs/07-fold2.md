# Brief 07 — a fold that lands, and a check a heap cannot pass

Implement task **2.2b**. The fold works; two problems remain.

## 1. It lands against the back wall

The folded strip ends at y ≈ -0.05, which is past the shelf's back edge. The shelf spans y -0.15 to
0.25. A half fold of a 0.40 m towel should put the front edge at y ≈ 0.05, leaving the strip in the
middle of the shelf.

Change the fold target so the **final y-centre of the garment is within 0.02 m of 0.05**. Adjust the
trajectory, not the arms. If a joint limit blocks it, say which joint and by how much.

## 2. The check is too weak

`ratio 0.38, overlap 1.00` would also pass if the towel were dragged into a heap. Replace the check
with three conditions, all printed:

- **width:** x-extent after >= 0.90 x before. A heap loses width; a fold keeps it.
- **depth:** y-extent after <= 0.60 x before.
- **on top:** the mean z of the moved half is at least 2 mm above the mean z of the stationary half.

`FOLDED` only when all three pass. Print all six numbers (x before/after, y before/after, mean z of
each half).

## 3. The fold must be visible as a fold

Render two frames: `sim/out/fold_mid.png` at the moment the front edge passes over the back edge, and
`sim/out/fold_end.png` after release. Both from the `inside` camera.

## Constraints

- Do not change the arms, the cabinet or the garment.
- Keep the other 9 checks passing; `fold-folded` now uses the three conditions.
- One approach; if the fold target cannot be reached, report the limit and stop.

## Acceptance

```
sim/.venv/bin/python sim/fold.py
cd sim && .venv/bin/python check.py
```

`fold.py` prints the six numbers and `FOLDED`; `check.py` prints `VERDICT: PASS (10 checks)`.

## Report

The six numbers, the final y-centre, the joint that limited the reach (if any), and both frame paths.
Do not commit; the PM reviews first.
