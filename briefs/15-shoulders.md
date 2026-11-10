# Brief 15 — implement 3.7 as written

Task 3.7 in `tasks.md` is the source of truth: bases at **(0.05, -0.08, 0.75)** and
**(0.75, -0.08, 0.75)**. Ignore brief 14's y = -0.20; it was wrong and has been superseded.

## What to change

- Move both shoulder bases to y = -0.08, x = 0.05 and 0.75, z = 0.75.
- Re-orient the arms to reach forward (+y) and down.
- Re-solve the ready pose with the same 2-link IK, adapted to the new base.
- Keep the link lengths, the gripper and the joint ranges.

## Verify

For the 9 position drops at yaw 0, print:

```
dx     dy     max|shoulder|   grip-to-corner
```

Both must hold on all 9: max |shoulder| < 1.2 rad, gripper-to-corner < 0.08 m.

If any drop exceeds 0.44 m reach, report the distance and stop — do not lengthen the links.

## Also

- Render `sim/out/arms.png` from the `inside` camera, for PM review only (not an acceptance criterion).
- `check.py` must still pass its existing checks.

## Report

The 9-row table, the frame path, and whether the arms read as reaching forward. Do not commit; the PM
reviews first.
