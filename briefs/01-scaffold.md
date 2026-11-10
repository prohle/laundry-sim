# Brief 01 — scaffold, garment, cabinet, one frame

Implement tasks **1.1 and 1.2** from `.kiro/specs/laundry/tasks.md`, then stop.

## What to build

### `sim/garment.py`

A parametric garment generator. No downloaded assets.

- `--kind towel`: a rectangle. Defaults: 0.70 x 0.40 m, cell 0.035 m, mass 0.48 kg.
- `--kind tee`: a T-shape: body width x length, two sleeves. Defaults: W 0.50, H 0.70,
  sleeve 0.22, sleeve depth 0.18, cell 0.035.
- `--out path.obj`.
- Build the garment in the **XZ plane** (y = 0), so gravity hangs it vertically.
- Triangulate on a grid; weld shared vertices; write `v` and `f` lines.
- Print: kind, vertices, triangles, and the ids of the two shoulder pin vertices
  (nearest to (0, sleeve_depth) and (W, sleeve_depth)).
- Also expose the same function as an importable API: `build(kind, **params) -> (verts, faces, pins)`.

### `sim/scene.py`

Builds the MJCF as a **string** (no external XML file), returns it, and can write it to `sim/out/scene.xml`.

- Cabinet: 0.70 x 0.60 x 1.10 m, open at the front. Five boxes (back, left, right, top, bottom).
  Use `contype="0" conaffinity="0"` on the cabinet geoms for now — the cloth must not collide with it
  yet; task 2 adds real contact.
- Shelf at z = 0.55 m, same size as the cabinet footprint.
- Garment: `flexcomp type="mesh" file="<obj>" dim="2"`, `<edge equality="true"/>`, pinned at the two
  shoulder ids, resting just above the shelf.
- Two cameras:
  - `inside`: position (0.35, -0.95, 0.85), looking at (0.35, 0, 0.62), fovy 40.
  - `top`: position (0.35, 0, 1.35), looking straight down at (0.35, 0, 0.55), fovy 45.
- Two lights: a key light from the front-left above, and a dim fill.

Compute camera `xyaxes` from position and target (do not hand-guess).

### `sim/run.py`

- `--frames N` (default 1), `--camera inside|top`, `--out sim/out/frame.png`, `--seed`.
- Set `MUJOCO_GL=egl` before importing mujoco.
- Load the scene, step `N * steps_per_frame` (default 25 at timestep 0.004), render.
- Print: vertices, triangles, steps, final garment z-range, and the output path.
- Exit non-zero on NaN in `flexvert_xpos`.

## Hard constraints

- Python from `sim/.venv/bin/python` (MuJoCo 4.0, NumPy, Pillow already installed).
- No network. No asset downloads.
- Deterministic: no unseeded randomness.
- Keep `sim/` under 400 lines total for this brief. Clarity over cleverness.

## Acceptance

```
sim/.venv/bin/python sim/garment.py --kind towel --out sim/out/towel.obj
sim/.venv/bin/python sim/garment.py --kind tee   --out sim/out/tee.obj
sim/.venv/bin/python sim/run.py --frames 1
```

All exit 0. `sim/out/frame.png` exists and is 1280x720. The printed z-range shows the garment above
the shelf and below the cabinet top.

## Report

The task numbers (1.1, 1.2), the files written, the three commands' output, and the path to the frame.
Do not start task 1.3.
