# Brief 34 — let the cloth slide, keep it on the board

Revise **7.2**. The nominal fold passes; the eval is 4/10. Two mechanical causes, both visible in your
numbers: the cloth rides up on the vertical flaps (mean z 0.86–0.89 mid-program), and 103–202 vertices
end below the board.

## 1. The flap must not hold the cloth

The clamp holds the fold; the flap should let go. Set **flap–cloth friction to 0.15** (from 0.8) and
keep the clamp at 0.8. If the fold then fails because the cloth slides during the *fold*, raise it in
0.05 steps to the lowest value that still folds, and report that value.

## 2. A rim keeps the cloth on the board

Add a 0.02 m high, 0.02 m wide rim around the board's outer edge (four thin boxes, `contype="1"`,
`conaffinity="1"`). It stops the cloth sliding off during folds. It is part of the machine, not a
cheat: real folding boards have a lip or a recess.

## 3. Re-run

```
sim/.venv/bin/python sim/flapfold.py --garment towel
sim/.venv/bin/python sim/eval.py --policy flaps --runs 10 --seed 11
```

## 4. The props property

`extent_monotone` now runs on the arms path, which is no longer the shipped fold — the arms are the
loader. Move the property to the **flap path**: during a fold, the footprint area must not increase
between consecutive samples by more than 5%. Keep the arms path out of it. Do not delete the property.

Add task **7.5** to `tasks.md` for this if it is not there.

## Acceptance

- `check.py` passes all 20 checks.
- The towel program reports its four steps.
- The eval reports the success rate as it is.

## Report

The friction value that worked, the eval table, the per-step numbers, and whether the rim changed the
fold geometry. Do not commit.
