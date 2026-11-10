# Brief 12 — fix the corner detector

Implement task **3.5**. Your diagnostic showed the grasp targets at different depths — left
(0.10, 0.318), right (0.757, 0.078). That is the bug that makes the ready pose exceed the limit.

## The rule

The garment is a rectangle, so the two grasp targets are simply:

- the vertex with the largest y among those with `x < centroid_x`;
- the vertex with the largest y among those with `x > centroid_x`.

No principal axes, no polygon corners, no clustering. Replace the old rule.

## Verify on the grid

45 drops: yaw in {-20, -10, 0, 10, 20}°, dx and dy each in {-0.04, 0, 0.04} m. For each, print:

```
yaw   dx     dy    left(x,y)        right(x,y)       |dy|   sep
```

- `|dy|` = |y_left − y_right|; must be < 0.02 m for every drop.
- `sep` = x_right − x_left; must be > 0.6 m for every drop.

## Then re-run the 3.4 diagnostic

With the fixed corners, repeat the `d` table from brief 11 (max |shoulder| at each waypoint for
`d` = 0, 0.04, 0.08, 0.12, 0.16). Report whether the ready pose is now inside the limit.

Do not change the trajectory yet. This brief is perception only.

## Acceptance

- All 45 drops pass both conditions.
- The new `d` table is printed.
- `check.py` still passes 11 checks; add `corners-front` if it is cheap (one seeded drop, assert the
  two targets are at the front edge).

## Report

The 45-row table (or a summary plus the worst row), the new `d` table, and whether the ready pose is
inside the limit now. Do not commit; the PM reviews first.
