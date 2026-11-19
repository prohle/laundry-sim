# Brief 48 — export the fold as a replay

Implement task **10.1** only.

## 1. Read the local design reference first

`_local/pottery-v1-faithful/fold-and-stack-cobots.html` — read its visible text and its interaction
design (what the machine view shows a visitor: the cycle timing, the per-step fold log, the folded
size, the scrub and replay controls). The standing rules for this file: **never mention it, never copy
its code, never commit or link it.** Take the interaction design only. In `tasks.md`, Phase 10 says
only "replay player" — keep it that way.

## 2. `sim/replay.py`

Export one garment's arms half fold as a single JSON the browser can replay:

```json
{
  "kind": "tee",
  "frames": N,
  "fps": 30,
  "dt": 0.004,
  "static": [ { "name": "board_centre", "type": "box", "pos": [x,y,z], "size": [sx,sy,sz], "rgba": [..] }, ... ],
  "joints": [ ["arm_l_shoulder", ... 8 joint names ] ],
  "angles": [ [ 8 angles at frame 0 ], [ ... frame 1 ], ... ],
  "cloth":  [ [ [x,y,z] per vertex at frame 0 ], ... ],
  "log": [ { "step": "hem_to_fold", "width": .., "depth": .., "on_top_mm": .. } ]
}
```

- The static scene: cabinet walls, board centre, four flaps, rim, the smoothing bar, and the arm links
  (each link as a box, with its parent joint named and its joint axis, so the player can rebuild the
  kinematic chain).
- The dynamic state: every Kth step, all 8 arm joint angles and every cloth vertex's world position.
  Pick K so the JSON stays under ~15 MB for the tee (387 vertices); state K and the byte size.
- `log`: the real per-step numbers from the fold, the same ones `fold.py` prints.
- Deterministic: two exports are byte-identical.
- Write to `public/replay-<kind>.json` and also `sim/out/replay-<kind>.json`.

## Acceptance

```
sim/.venv/bin/python sim/replay.py --garment tee
sim/.venv/bin/python sim/replay.py --garment towel
```

Both exit 0; the files exist; a frame count, vertex count and byte size are printed; the JSON parses;
no NaN anywhere. The tee arms half fold still passes.

## Report

K, the frame count, the byte sizes, what the reference's machine view shows that you decided to record
(and anything you decided not to), and the joint chain you exported. Do not commit.
