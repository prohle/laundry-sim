# Brief 30 — the folding board

Implement task **7.1** only. Read `docs/folds.md` first: it is the reference for why the board replaces
the arms as the folding mechanism.

## The board

On the shelf, replacing the bare shelf surface:

- **board**: 0.80 x 0.60 x 0.02, top at z = 0.71, centred on the cabinet (x 0.20–1.00, y −0.25–0.35).
- **four flaps**, each 0.30 deep, hinged at a board edge, starting flat (horizontal, level with the
  board) and rotating **inward** 0–180°:
  - `flap_left`  — hinge along y at x = 0.20
  - `flap_right` — hinge along y at x = 1.00
  - `flap_front` — hinge along x at y = −0.25
  - `flap_back`  — hinge along x at y = 0.35
- **smoothing bar**: a 0.70 x 0.04 x 0.04 box on a prismatic joint above the board, sweeping y from
  −0.20 to 0.30 at z = 0.735. It does not touch the cloth in this task; it only needs to exist and move.
- Position actuators on all four hinges and the bar.

The flaps must have contact enabled (`contype="1" conaffinity="1"`) and the garment flex contact too, so
a rotating flap pushes the cloth. Friction 0.8.

## The arms

Keep them in the scene as the loader. Do not use them for folding. They stay at the ready pose and must
not collide with the board or the flaps (set their geoms `contype="0"` for now).

## Cameras

Add four, all computed with the existing `xyaxes` helper, all aimed at the board centre (0.60, 0.05, 0.71):

| name | position |
|---|---|
| `top` | (0.60, 0.05, 1.55) |
| `side_l` | (0.05, 0.05, 0.95) |
| `side_r` | (1.15, 0.05, 0.95) |
| `front` | (0.60, 0.95, 0.95) |

Keep `inside` as it is.

## Scripted test

`sim/run.py --flap left --angle 90 --frames 1` rotates one flap to 90° over 100 steps and renders from
`top`. Same for the other three.

## Acceptance

- `sim/run.py --frames 1 --camera top` shows the garment on the board, no NaN.
- Each flap reaches 90° ± 2° in the scripted test.
- The smoothing bar traverses its joint range.
- `check.py` gains `board-parts` (board, four flaps, bar, four cameras by name) and `flap-travel`
  (each flap reaches 90°).
- The existing towel fold still passes (the arms path is untouched).

## Report

The body and joint names, the flap angles reached, the four camera frame paths, and the check output.
Do not commit.
