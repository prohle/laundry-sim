# Brief 14 — move the shoulders off the singularity

Implement task **3.7** only.

## Why

The shoulders are mounted at x = 0.05 and 0.75, directly above the corners they must grasp. The
target sits under the shoulder, so the yaw angle approaches ±π and the ±2.2 rad limit is hit at the
ready pose (2.829 rad in the diagnostic). No trajectory can fix a target that is behind the arm.

## What to change

- Move both shoulder bases to the **back wall**: `(0.05, -0.20, 0.75)` and `(0.75, -0.20, 0.75)`.
- Re-orient the arm so it reaches forward (+y) and down to the towel corners.
- Re-solve the ready pose with the same 2-link IK, adapted to the new base position.
- Keep the link lengths, the gripper and the joint ranges.

## Verify

For the 9 position drops at yaw 0, print the max |shoulder| at the ready pose. It must be **< 1.2 rad**
for every drop.

Also print the gripper-to-corner distance after settling; it must stay < 0.08 m.

## Acceptance

- Max |shoulder| < 1.2 rad on all 9 drops.
- Gripper-to-corner < 0.08 m on all 9.
- `check.py` passes 12 checks.
- The `inside` camera still frames both arms; render `sim/out/arms.png` and confirm by eye.

## Report

The 9-row table (dx, dy, max |shoulder|, distance), the frame path, and whether the arms now read as
reaching forward rather than hanging down. Do not commit; the PM reviews first.
