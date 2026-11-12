# Brief 39 — a blade, and a cloth that folds instead of crumpling

Add task **7.6** to `tasks.md` first. The board with flaps is not converging: one flap crumples the
cloth (area ratio 0.22 where a half fold is 0.5). Two causes to test together.

## 1. The cloth is too floppy

A cloth with no bending stiffness buckles into a heap instead of folding along a line. Find the MuJoCo
4 flex parameter that raises bending stiffness for a 2D flex (look in the installed schema or docs;
do not guess) and raise it until a fold is a fold, not a crumple. Report the parameter, the value, and
how you found it.

Test: a single flap fold with the stiffer cloth. A clean half fold should give an area ratio near
**0.5**, not 0.22, and on-centre above 60%.

## 2. A blade instead of a flap

Add a **blade**: a vertical plate 0.60 x 0.02 x 0.12 on a prismatic joint in x, sweeping from x = 0.22
to x = 0.60 at z = 0.72 (just above the board). It pushes the left half of the garment over the centre
line. No hinge, no clamp, no carry.

Test: one blade sweep on the towel. The cloth should double over the centre line.

## Run

```
sim/.venv/bin/python sim/flapfold.py --garment towel --mode blade
sim/.venv/bin/python sim/flapfold.py --garment towel --mode flap --steps left
```

Print area ratio, mean z, on-centre, below-board, and one frame from `top` for each.

## The decision rule

- Blade gives a ratio near 0.5 and on-centre > 60%: the blade is the mechanism. Say so and stop.
- Flap with stiffer cloth does: the board stays, with the stiffness change. Say so and stop.
- Neither does: say so and stop. Do not tune further; the PM decides.

## Report

The stiffness parameter and value, both result tables, both frames, and one sentence on which mechanism
produced a fold. Do not commit.
