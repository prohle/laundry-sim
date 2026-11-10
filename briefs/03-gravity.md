# Brief 03 — gravity on, the towel rests, the top camera works

Implement task **1.2b** only. Your four catches in 1.2 were correct; three of them are this task.

## 1. Gravity and contact

- `gravity="0 0 -9.81"` in `<option>`.
- Shelf geom: `contype="1" conaffinity="1"`.
- Garment: `<contact contype="1" conaffinity="1" condim="3" friction="0.8 0.02 0.001"/>`.
- Cabinet walls and floor: leave `contype="0" conaffinity="0"` for now, so the cloth cannot catch on a
  wall seam. Task 2 turns them on with the arms.
- Let the scene settle for 200 steps before rendering. The towel should rest on the shelf, not fall
  through it.
- If the cloth tunnels through the shelf, raise the flex `radius` or lower the timestep; report which.

## 2. Top camera

The top camera at z = 1.40 looks at the roof. Move it **inside** the cabinet, under the top panel:
position (0.40, 0.05, 1.05), target (0.40, 0.05, 0.55), fovy 50. The roof is then behind the camera.

## 3. Keep the rest

Do not change the cabinet, the garment placement, the inside camera, or the lights. Do not start 1.3.

## Acceptance

```
sim/.venv/bin/python sim/run.py --frames 1 --garment towel
sim/.venv/bin/python sim/run.py --frames 1 --garment towel --camera top
```

Both exit 0. After settling, the towel z-range is **0.56–0.60** (resting on the shelf top at 0.56).
Both frames are 1280x720 and show the towel. Print the z-range before and after settling.

## Report

Task number, the z-range before and after, the two frame paths, and whether the cloth tunnelled.
Do not commit; the PM reviews first.
