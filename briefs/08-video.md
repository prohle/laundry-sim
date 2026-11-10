# Brief 08 — the fold, on video

Implement task **2.4**: render the scripted fold to an mp4 that a judge could watch.

## What to build

`sim/video.py` (or `sim/run.py --video`) that:

- runs the same fold trajectory as `sim/fold.py` (import it; do not duplicate it);
- renders every Nth step from the `inside` camera at 1280x720;
- writes `sim/out/fold.mp4`, H.264, 30 fps, about 4 seconds (120 frames);
- prints: frames, seconds of simulated time, wall-clock time, output path, file size.

Use `ffmpeg` (installed at `/usr/bin/ffmpeg`) by piping raw RGB frames to stdin:

```
ffmpeg -y -f rawvideo -pix_fmt rgb24 -s 1280x720 -r 30 -i - -c:v libx264 -pix_fmt yuv420p out.mp4
```

Do not write 120 PNGs to disk first.

## Framing

The fold currently ends as a strip at the back of the shelf, which is correct geometry but leaves the
front half of the shelf empty and the machine looking half-used. Two changes, both cosmetic:

- Move the `inside` camera 10 cm lower and 10 cm closer, so the shelf fills more of the frame.
- Add a subtle warm light from inside the cabinet (a small point light above the shelf) so the cloth
  reads against the grey walls.

Do not move the garment, the shelf or the arms.

## Acceptance

```
sim/.venv/bin/python sim/video.py
```

Exits 0, writes `sim/out/fold.mp4`, and the printed frame count is 120. `sim/check.py` still passes
10 checks.

## Report

The frame count, the wall-clock render time, the file size, and one sentence on whether the fold reads
as a fold when watched. Do not commit; the PM reviews first.
