# Brief 24 — the fold-program executor

Implement task **5.5** only. This is the change that makes a T-shirt possible: a fold becomes a
sequence of steps, each with its own check, instead of one scripted trajectory.

## The program

```python
Step = {
  "name": "sleeve_left",
  "grasp": ["sleeve_l"],          # landmark names, or (x, y) in world
  "lift_z": 0.66,
  "carry": (0.0, -0.30),          # world dx, dy while lifted
  "lower_z": 0.62,
  "release": True,
  "check": "sleeve_inside",       # optional name of a per-step check
}
Program = [Step, ...]
```

`run_program(program)` executes the steps in order with the existing kinematic grasp, and returns:

```python
{"steps": [{"name":..., "ok":..., "numbers":{...}}, ...], "folded": bool, "time": s}
```

A program succeeds only if every step's check passes and the final fold check passes.

## Per-step checks

Implement two, both geometric and printed:

- `sleeve_inside`: the sleeve's vertices (the ones outside the body's x-range before the step) are now
  inside the body outline, with margin 0.
- `halves_overlap`: the moved half's interval on the fold axis overlaps the stationary half by at
  least 60%.

## Convert the towel

Express the current towel fold as a **one-step program** with `halves_overlap` as the step check, and
route `eval.py` through the executor.

Acceptance: the towel result is unchanged — 55/55 on the unseen drops (seeds 11–20), 100/100 on all
runs — and `fold.py` still prints FOLDED.

## Constraints

- No change to the grasp mechanics, the arms, the cabinet or the checks' thresholds.
- Keep the old single-trajectory path working until the program path matches it.
- `check.py` must pass.

## Report

The step schema as implemented, the per-step numbers for the towel, the unchanged eval result, and any
place the program model was awkward for a single fold. Do not commit; the PM reviews first.
