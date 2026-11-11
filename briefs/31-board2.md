# Brief 31 — the board, correctly

Revise task **7.1**. Your version puts the flaps outside the board and folds them up and over, so the
garment never lies on a flap and a flap cannot carry cloth. That is why the towel result changed and why
the flaps poke through the walls.

A retail folding board is **one flat surface**: a centre panel plus four coplanar flaps. The garment
lies across all five. Folding = a flap rotates 180° about its hinge, carrying the garment section that
sits on it over the centre.

## Geometry

Tri-fold board, total **0.80 x 0.70**, centred at (0.60, 0.05), top at z = 0.71:

| part | size | hinge | at rest |
|---|---|---|---|
| `board_centre` | 0.267 x 0.233 | — | x 0.467–0.733, y −0.067–0.167 |
| `flap_left` | 0.267 x 0.233 | along y at x = 0.467 | x 0.200–0.467 |
| `flap_right` | 0.267 x 0.233 | along y at x = 0.733 | x 0.733–1.000 |
| `flap_front` | 0.800 x 0.233 | along x at y = 0.167 | y 0.167–0.400 |
| `flap_back` | 0.800 x 0.233 | along x at y = −0.067 | y −0.300–−0.067 |

- All five are **coplanar at rest**, tops at z = 0.71, 0.02 thick.
- Each flap rotates **180° inward**, over the centre, in the hinge direction that carries its cloth
  onto the board. `flap_front` is at +y (the open side), `flap_back` at −y.
- Flap–board and flap–flap collisions off; **flap–cloth contact on** (contype 1, friction 0.8).
- The garment sits on the board with its centre over `board_centre`; it overhangs onto the flaps by
  design.

## The test that proves it

`sim/run.py --flap left --angle 180 --frames 2` must show, from `top`, the left third of the garment
lying **on top of the centre** after the rotation. Add a check `flap-carries`: after a 180° left fold,
the mean z of the garment's left third is at least 5 mm above the centre panel and its x-extent has
moved right by at least 0.15 m.

## Keep

- The four cameras and the smoothing bar (move the bar to z = 0.745 so it clears the folded cloth).
- The arms as loaders, not folders.
- The roof hidden for `top`.

## Fix the names

`flap_front` is at +y, the open side, matching the `front` camera. Your previous version had it at −y.

## Acceptance

- `flap-carries` passes for left, right and front.
- Each flap reaches 180° ± 3°.
- `sim/run.py --frames 1 --camera top` shows the garment on the board, no NaN.
- `check.py` passes, including the towel fold; if the towel result changes, report the new numbers
  rather than hiding them.

## Report

The five panels' extents, the `flap-carries` numbers for three flaps, the new towel result, and the four
camera frames. Do not commit.
