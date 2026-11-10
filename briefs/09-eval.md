# Brief 09 — the baseline number

Implement tasks **3.1 and 3.3**: the evaluation harness, with randomised drops. This is the number
the whole entry rests on, so it must be honest and reproducible.

## `sim/eval.py`

For each run `i` in `0..N-1`:

1. Seed `rng = numpy.random.default_rng(seed + i)`.
2. **Randomise the drop:** garment yaw uniform in ±20°, position offset uniform in ±0.04 m in x and y.
   Rebuild the scene with that pose.
3. **Perception:** compute the two grasp targets from the garment's actual vertices — the two corners
   on the front edge (largest y), left and right. Do not use fixed world targets.
4. Run the same fixed fold trajectory as `sim/fold.py` (import it).
5. Evaluate with the 2.2b check: width, depth, on top.
6. Record: success, simulated time, wrinkle score (mean per-edge strain deviation from rest length).

Print a table and a summary:

```
run  yaw   dx     dy    width  depth  ontop  result  wrinkle
 0   12°   0.02  -0.01  0.98   0.52   0.011  FOLDED  0.041
...
success: 3/10   mean time: 2.6 s   mean wrinkle: 0.044
```

Write the same table to `sim/out/baseline.md`.

## Reproducibility

`--runs 10 --seed 1` twice gives identical numbers, to 1e-6. Print the seed.

## Acceptance

```
sim/.venv/bin/python sim/eval.py --runs 10 --seed 1
sim/.venv/bin/python sim/eval.py --runs 10 --seed 1   # identical
cd sim && .venv/bin/python check.py
```

The two runs print the same table. `check.py` gains `eval-reproducible`: two 3-run evaluations with
the same seed match, and finishes in under 60 s.

## Constraints

- One run must take under 6 s wall-clock; 10 runs under 60 s.
- Do not tune the trajectory to raise the success rate. This is the baseline; a low number is the
  result, not a failure.
- If the success rate is 0/10, that is still a valid baseline — report it and stop.

## Report

The full table, the success rate, mean time, mean wrinkle, and one sentence on why the failures failed
(rotation? reach? grasp?). Do not commit; the PM reviews first.
