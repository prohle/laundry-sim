# Brief 06 — the scripted fold

Implement task **2.2** only. This is the gate: if the towel folds, the project is alive.

## Grasp

Version 1 is a **kinematic grasp**, stated as such. After each `mj_step`:

- for each grasped vertex, move its qpos entry toward the gripper's pinch point with
  `q += alpha * (pinch - q)`, `alpha = 0.35`;
- then `mj_forward`.

Find the qpos offset first: a flex vertex's DOFs start at `3 * (m.flex_vertadr[f] + i)`. Verify it
before building the trajectory — set one entry, `mj_forward`, and confirm `flexvert_xpos` moved. If
that is wrong, find the right offset and say what it was.

If the override explodes (NaN, or the cloth tears away), reduce `alpha` and clamp the per-step
movement to 2 cm. Report which value worked.

## The fold

Fold along **y**, front edge over back:

1. Ready pose: both grippers over the two front-edge corners of the towel, fingers open.
2. Close fingers (`grip` 0), settle 50 steps.
3. Lift both corners to z = 0.78 over 150 steps.
4. Move both grippers to y = 0.18 over 200 steps, keeping z high.
5. Lower to z = 0.62 over 100 steps.
6. Release (`grip` 0.03), retract 50 steps.

Total ~550 steps at timestep 0.004 (2.2 s simulated).

## The check

`sim/fold.py` prints:

```
y-extent before: 0.400
y-extent after:  0.212
ratio:           0.53
overlap:         0.78
FOLDED
```

- `ratio = after / before`; folded if `ratio <= 0.6`.
- `overlap`: project the vertices onto y, split at the fold line, and measure the overlap of the two
  halves' intervals as a fraction of the smaller one; folded if `>= 0.6`.
- Exit 0 only when both pass; otherwise print `NOT FOLDED` and exit 1.

Add `fold-folded` to `sim/check.py` using the same numbers.

Render `sim/out/fold.png` from the `inside` camera at the end of the fold, and write
`sim/out/fold_trace.txt` with the y-extent every 25 steps.

## Constraints

- Do not change the arms' geometry or the cabinet.
- Do not enable arm-cloth contact; the grasp is kinematic.
- Keep the existing 9 checks passing.
- If the fold does not work after two approaches, stop and report the numbers. Do not tune for hours.

## Acceptance

```
sim/.venv/bin/python sim/fold.py
cd sim && .venv/bin/python check.py
```

`fold.py` prints `FOLDED` and exits 0; `check.py` prints `VERDICT: PASS (10 checks)`.

## Report

Task number, the qpos offset and how you verified it, `alpha`, the four numbers, the trace path, the
frame path, and whether the cloth stayed intact. Do not commit; the PM reviews first.
