# Brief 05 — two arms

Implement task **2.1** only: the arms exist, are actuated, and can reach a ready pose. No grasp and
no fold yet — that is 2.2.

## Geometry

Mirror two arms inside the cabinet, mounted on the left and right interior walls, reaching toward the
shelf centre.

Each arm, from base to tip:

- **base** — a fixed box on the wall, 0.06 x 0.06 x 0.10 m.
- **shoulder yaw** — hinge about z.
- **upper link** — 0.24 m, box 0.03 x 0.03 x 0.24, hinge about y.
- **elbow** — hinge about y.
- **forearm** — 0.20 m, box 0.025 x 0.025 x 0.20.
- **wrist** — hinge about y.
- **gripper** — a palm 0.05 x 0.04 x 0.02 and two fingers, each on a slide joint, opening 0.06 m,
  finger 0.04 x 0.01 x 0.05.

Use position actuators (`<position kp="40" kv="2"/>` or similar) on every joint, with sensible ranges.
The arm must be able to reach the towel's two far corners and the cabinet centre.

Name everything: `arm_l_shoulder`, `arm_l_elbow`, `arm_l_wrist`, `arm_l_grip`, and the same for `r`.

## Ready pose

Add `sim/arms.py` (or a function in `scene.py`) that sets the actuators to a **ready pose**: both
grippers 5 cm above the two corners of the towel, fingers open, arms not intersecting the cabinet or
each other. Solve it with simple inverse kinematics (2-link planar IK is enough) or hand-tune the
angles and print them. Do not use an optimiser.

## Verification

- `sim/check.py` gains `arms-present`: 8 arm joints and 2 gripper slides exist, by name.
- `sim/check.py` gains `arms-ready`: after 200 steps at the ready pose, each gripper's pinch point is
  within 8 cm of its target corner and above z = 0.58.
- Render `sim/out/arms.png` from the `inside` camera showing both arms in the cabinet.

## Constraints

- Cabinet walls stay `contype="0"` — the arms do not collide with them yet.
- The garment does not collide with the arms yet.
- Keep the existing checks passing.

## Acceptance

```
cd sim && .venv/bin/python check.py
sim/.venv/bin/python sim/run.py --frames 1 --arms ready
```

`check.py` prints `VERDICT: PASS` including the two new checks. The frame shows both arms.

## Report

Task number, the joint names, the ready-pose angles, the gripper-to-corner distances, the check
output, and the frame path. Do not commit; the PM reviews first.
