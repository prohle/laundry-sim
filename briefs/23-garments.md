# Brief 23 — the garment family

Implement task **5.4** only. Kiro writes it; the spec and the acceptance are the PM's.

## What to add to `sim/garment.py`

Keep `build(kind, **params) -> (verts, faces, pins)`. Add kinds and a second return value: named
**landmarks**, so the fold programs can find an edge without searching.

All shapes are built in the **XZ plane** (y = 0), like the existing tee, and are generated on a grid
with welded vertices.

| kind | shape | landmarks |
|---|---|---|
| `tee` | existing T | `sleeve_l`, `sleeve_r`, `hem_l`, `hem_r`, `shoulder_l`, `shoulder_r` |
| `pants` | Π: waist band on top, two legs below, a notch between | `waist_l`, `waist_r`, `hem_l`, `hem_r`, `crotch` |
| `shorts` | same, shorter legs | same |
| `dress` | A-line: narrow bodice, wide hem | `shoulder_l`, `shoulder_r`, `hem_l`, `hem_r` |

Parameters, all with defaults:

```
towel   W 0.70  H 0.40
tee     W 0.50  H 0.70  sleeve 0.22  sleeve_depth 0.18
pants   W 0.44  H 0.95  inseam 0.55  gap 0.05
shorts  W 0.44  H 0.55  inseam 0.28  gap 0.05
dress   W 0.40  H 1.00  hem 0.70
```

Landmarks are returned as `{name: (x, z)}` in the garment's local frame, at the nearest mesh vertex.

## CLI

```
sim/.venv/bin/python sim/garment.py --kind pants --out sim/out/pants.obj
```

Prints kind, vertices, triangles, pins, landmarks, and the bounding box.

## Acceptance

- All five kinds write an OBJ and exit 0.
- No degenerate triangles (zero area) in any mesh.
- Each mesh is a single connected component.
- `check.py` gains `garments-all`: all five build, each with >100 vertices, no degenerate triangle, one
  component.

## Constraints

- No assets, no network.
- Do not change the towel or tee geometry — the existing eval depends on them.
- Keep it under 250 lines.

## Report

The five counts and landmark tables, the check output, and any shape you had to approximate. Do not
commit; the PM reviews first.
