# Brief 45 — render every garment's fold

Add task **8.4** to `tasks.md` first, then implement it.

## What to add

`sim/video.py` gains `--garment {towel,tee,pants,shorts,dress}` (default towel) and `--out`. For a
non-towel garment it renders that garment's **arms half fold** — the same trajectory as
`sim/fold.py --garment <kind> --policy arms` (import it; do not duplicate the program). 120 frames at
1280x720, 30 fps, from the `inside` camera, writing `sim/out/fold-<kind>.mp4`.

The towel path must not change: with no `--garment` it renders exactly what it renders today.

## Also

Copy nothing into `public/`; the PM handles the page. Keep it under 30 lines of change.

## Acceptance

```
sim/.venv/bin/python sim/video.py --garment tee
sim/.venv/bin/python sim/video.py --garment pants
```

Both exit 0 and write their mp4. `sim/out/fold.mp4` (the towel) still renders.

## Report

The four files with sizes and frame counts, the wall time per render, and anything that had to change in
`fold.py` to make the fold importable. Do not commit.
