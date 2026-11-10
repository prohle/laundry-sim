# Design — Laundry

## Stack

- Python 3.12, MuJoCo 4.0, NumPy, Pillow. Virtualenv at `sim/.venv` (gitignored).
- Cloth is a MuJoCo **flex** (`dim=2`), not a mesh asset. A surface mesh is loaded as an OBJ.
- Rendering is MuJoCo offscreen with `MUJOCO_GL=egl`, 1280x720, no browser.
- Everything is deterministic under a seed.

## Modules

```
sim/
  garment.py   parametric towel / tee -> OBJ, and the pin vertex ids
  scene.py     builds the MJCF string: cabinet, shelf, arms, garment, cameras
  run.py       load, step, render a frame or a sequence
  fold.py      scripted fold + geometric fold check
  eval.py      N seeded runs, success rate, wrinkle score
  check.py     assertions for R1-R4; exit non-zero on failure
  out/         generated OBJ and PNG (gitignored)
```

## Scene

- Cabinet: 0.80 x 0.60 x 1.10 m, open at the front. Five boxes, no collisions with the arms' mounts.
  The tee (0.94 m across the sleeves) needs a wider cabinet; the towel (0.70 x 0.40) is the default
  and fits with clearance.
- Shelf at z = 0.55 m. The garment lies on it.
- Two arms, mirrored, each: shoulder yaw, elbow pitch, wrist pitch, parallel-jaw gripper.
  Actuated with position servos. For the scripted fold, the arm joints follow a keyframed trajectory.
- Garment: generated OBJ, placed on the shelf, `mass` from the measured towel (0.48 kg default).
- Cameras: `inside` (into the cabinet, hero) and `top` (fold check).

## Grasp

Version 1 uses a **weld/pin constraint** from the gripper to two garment vertices. This is a
deliberate simplification: it isolates the fold geometry from contact tuning. Version 2 replaces it
with friction contact and reports the difference — that difference is itself a result.

## Fold check (R4)

Given the garment vertices before and after:

- project onto the fold axis;
- `extent = max - min` along that axis;
- folded if `extent_after <= 0.6 * extent_before`;
- and the two halves overlap by at least 60% of the folded area.

Both numbers are printed. A fold is never reported without them.

## Metrics (R5)

- **Success:** the fold check passes.
- **Time:** simulated seconds to the end of the fold trajectory.
- **Wrinkle score:** mean per-edge strain deviation from rest length, lower is smoother.
  It is a proxy, and the README says so.

## Determinism

All randomness comes from `numpy.random.default_rng(seed)`. The same seed reproduces the same drops,
the same trajectories and the same numbers.

## Honesty

The simulator is the instrument. The claim is "a policy folds a simulated garment", never "a machine
folds laundry". R7 is checked in review, not in code.
