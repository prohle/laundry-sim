# Brief 19 — hold more of the edge

Implement task **4.5** only.

## Why

Every failure is depth: 0.61–0.69 against 0.60. The kinematic grasp carries a patch of radius 0.12 m
around each front corner. If that patch is too small, the front edge sags between the two grippers and
the folded strip ends up deeper than it should. A wider patch drags more of the edge and should fold
tighter.

## What to change

- Grasp patch radius 0.12 → **0.16 m** in `sim/fold.py`.
- Nothing else. No trajectory change, no arm change, no threshold change.

## The run

```
sim/.venv/bin/python sim/eval.py --policy scripted --runs 10 --seed 6
```

Compare to **32/50** on the same seeds. Write the table to `sim/out/patch.md`.

## Acceptance

- The held-out table is printed and written.
- `check.py` passes.
- The nominal fold still prints FOLDED.

## Report

The table, the success rate, the delta, and whether the failures moved from depth to width or on-top.
If it does not beat 32/50, say so plainly and do not try another radius — the mechanism search stops
and the PM moves to the judged artefacts. Do not commit.
