# Brief 04 — the check

Implement task **1.3** only. This is the harness every later task is verified against, and a hook
will run it after every write, so it must be fast: **under 20 seconds**.

## `sim/check.py`

A plain Python script, no test framework. It runs a list of named checks and prints one line each:

```
PASS  scene-loads
PASS  garment-towel
...
VERDICT: PASS (7 checks)
```

On failure print `FAIL  <name>: <detail>` and exit 1 at the first failure (or run all and exit 1 at
the end — your choice, but the failing name must be printed).

Checks, at minimum:

1. **garment-towel** — `garment.build("towel")` returns >100 vertices, >100 faces, and 2 pin ids in
   range.
2. **garment-tee** — same for `"tee"`, and the tee is wider than the towel.
3. **scene-loads** — `scene.build(...)` loads with `mujoco.MjModel.from_xml_string`, no exception.
4. **scene-parts** — the model has 5 cabinet geoms + 1 shelf + 2 cameras, by name.
5. **garment-on-shelf** — after 200 steps the garment's z-range is within 0.55–0.62 and contains no
   NaN.
6. **render** — a 1280x720 frame renders and is not a single flat colour (more than one distinct
   pixel value).
7. **deterministic** — two runs from the same seed give the same final z-range to 1e-6.

## Constraints

- Paths relative to `sim/check.py`, so it works from `sim/` and from the repo root.
- No network. No rendering to disk (render in memory).
- Keep it under 120 lines.

## Acceptance

```
cd sim && .venv/bin/python check.py
cd .. && sim/.venv/bin/python sim/check.py
```

Both print `VERDICT: PASS` and exit 0, and each finishes in under 20 seconds.

## Report

Task number, the check list with PASS lines, the runtime, and any check you had to weaken and why.
Do not commit; the PM reviews first.
