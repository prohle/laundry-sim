# Brief 02 — the cabinet, the shelf, one frame

Implement task **1.2** only, then stop. Task 1.1 is done (`sim/garment.py`, commit `04e9be3`).

## What to build

### `sim/scene.py`

Builds the MJCF as a **string** and returns it. Also `write(path)` for debugging.

- **Cabinet:** 0.80 wide (x), 0.60 deep (y), 1.10 tall (z), open at the front (+y). Five boxes:
  back, left, right, top, bottom. Wall thickness 0.02 m. Give them `contype="0" conaffinity="0"`
  for now; contact comes in task 2.
- **Shelf:** a box at z = 0.55, 0.76 x 0.56 x 0.02, inside the cabinet. No collision yet.
- **Garment:** `flexcomp type="mesh" file="<obj>" dim="2"`, `<edge equality="true"/>`.
  - Default `--garment towel`, using `sim/out/towel.obj`.
  - The garment is generated in the **XZ plane** and must lie **flat on the shelf**. Rotate it with
    `quat="0.7071 -0.7071 0 0"` (that maps local (x, 0, z) to world (x, z, 0)).
  - Place `pos` so the garment is centred on the shelf and 5 mm above it.
  - No pins for this scene.
- **Cameras:** compute `xyaxes` from a position and a look-at target. Do not hand-guess the axes.
  - `inside`: position (0.40, -0.95, 0.85), target (0.40, 0, 0.60), fovy 40.
  - `top`: position (0.40, 0.05, 1.40), target (0.40, 0.05, 0.55), fovy 45.
- **Lights:** a key light above-front-left, a dim fill from the right. The inside should read as a lit
  cabinet, not a black void.

### `sim/run.py` (minimal)

- `--frames N` (default 1), `--camera inside|top`, `--garment towel|tee`, `--out sim/out/frame.png`,
  `--seed 0`.
- Set `MUJOCO_GL=egl` **before** importing mujoco.
- Generate the garment OBJ if missing (call `garment.build`), then build the scene, load it, step
  `N * 25` steps at timestep 0.004, render one frame from the chosen camera.
- Print: garment, vertices, triangles, steps, garment z-range, frame path.
- Exit non-zero if `flexvert_xpos` contains NaN.

## Hard constraints

- Python from `sim/.venv/bin/python` (MuJoCo 4.0, NumPy, Pillow installed).
- No network, no assets.
- Keep it under 250 lines across both files.
- Do **not** run `tools/check.sh` — that is the retired Fold project's check. The sim check is task
  1.3 and does not exist yet. Verify by running the commands below.

## Acceptance

```
sim/.venv/bin/python sim/run.py --frames 1 --garment towel
sim/.venv/bin/python sim/run.py --frames 1 --garment tee --camera top
```

Both exit 0. `sim/out/frame.png` is 1280x720. The towel's z-range sits just above the shelf
(z ≈ 0.55–0.58) and below the cabinet top (1.10). The tee may overflow the cabinet width — say so in
the report rather than shrinking it silently.

## Report

Task number, files, both commands' output, the frame path, and any place where the brief was wrong.
Do not start task 1.3.
