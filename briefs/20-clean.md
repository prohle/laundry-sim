# Brief 20 — the clean number

Implement task **4.6** only. Seeds 6–10 were used to find the patch fix, so the 50/50 is not a clean
held-out result. Seeds 11–20 have never been run.

## The run

For each policy in {patch 0.12, patch 0.16}:

```
sim/.venv/bin/python sim/eval.py --policy scripted --runs 10 --seed 11   # seeds 11..20
```

- 10 runs per seed, seeds 11–20, 100 runs per config.
- Print one table per config: run, dx, dy, width, depth, ontop, result.
- Summary per config: success rate, mean time, mean wrinkle, and the number of **distinct drops**
  (seed + run index pairs that produce a unique (dx, dy) after the shift).

Write both to `sim/out/clean.md`.

## Rules

- Do not change the trajectory, the patch radius, the arms or the thresholds.
- If the 0.16 config is worse than 0.12 on the fresh seeds, report it plainly. That would mean the
  patch fix was fitted to seeds 6–10, and the README must say so.

## Acceptance

- Both tables printed and written.
- `check.py` passes.
- The distinct-drop count is stated for each config.

## Report

The two summary lines, the distinct-drop counts, the delta, and one sentence: is the patch fix real on
unseen drops, or was it fitted? Do not commit.
