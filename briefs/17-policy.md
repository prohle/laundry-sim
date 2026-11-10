# Brief 17 — the closed-loop policy, train/test split

Implement tasks **4.1–4.3**. This is a controller, not RL, and the writeup will say so.

## The observation

The perceived front corners `(x_l, y_l)` and `(x_r, y_r)` from `eval.true_corners`-style detection, and
the garment's current y-extent. That is all. No images, no state vector beyond this.

## The controller

The baseline fails when the towel sits further back: the fold target `y = -0.05` is absolute, so the
relative fold depth changes with the drop.

Replace the absolute target with a **relative** one:

```
fold_target_y = mean(y_l, y_r) - D
```

At the nominal drop `mean(y) = 0.25`, so `D = 0.30` reproduces the current `-0.05`. Fit `D` on the
training seeds only.

## The experiment

1. **Fit:** seeds 1–5, 10 runs each, scan `D` in {0.26, 0.28, 0.30, 0.32, 0.34}. Report the success
   rate for each `D` and pick the best.
2. **Test:** seeds 6–10, 10 runs each, the chosen `D`, and the scripted baseline on the same seeds.
   Do not adjust `D` after seeing the test numbers.
3. Write both tables to `sim/out/policy.md`.

## CLI

```
sim/.venv/bin/python sim/eval.py --policy scripted --runs 10 --seed 6
sim/.venv/bin/python sim/eval.py --policy relative --runs 10 --seed 6
```

Both must be reproducible.

## Acceptance

- The fit table, the chosen `D`, and the test table are printed and written.
- `check.py` passes; add `policy-reproducible` (two 3-run relative evaluations with the same seed
  match).
- If the relative controller does not beat 5/10 on the test seeds, report that honestly and stop. A
  negative result is a result.

## Report

The fit table, `D`, the test table, both success rates, and one sentence on why the relative target
helps or does not. Do not commit; the PM reviews first.
