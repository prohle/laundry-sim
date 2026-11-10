# Brief 25 — the T-shirt, three steps

Implement task **5.6** only. This is the gate: >= 6/10 on 10 unseen drops, or the multi-garment claim
is dropped.

## Fit the garment to the machine

The tee is 0.928 m across the sleeves; the cabinet interior is 0.76 m. Scale the default tee to fit:

```
tee  W 0.40  H 0.60  sleeve 0.17  sleeve_depth 0.16
```

That gives 0.74 m across, centred at x = 0.40, so the sleeves run 0.03–0.20 and 0.60–0.77, and the
body is 0.20–0.60. The arms at x = 0.05 and 0.75 can reach the sleeve tips.

## The program

Two steps, using the symmetric layout — both sleeves move at once, then the body:

1. **sleeves_in** — grasp `[sleeve_l, sleeve_r]`, lift to z 0.66, `inward` 0.17 (mirrored per arm, so
   both come to the body edge), lower to 0.62, release. Check `sleeve_inside` against body x 0.20–0.60.
2. **body_half** — grasp `[hem_l, hem_r]`, lift 0.66, carry to world y = 0.25 (the fold line), lower
   0.62, release. Check `halves_overlap`.

The garment lies with its hem at the front (world y ≈ 0.03) and its shoulders at the back.

## The run

```
sim/.venv/bin/python sim/eval.py --garment tee --runs 10 --seed 11
```

Ten unseen drops (seeds 11–20, position ±0.04 m, yaw 0). Report the per-step pass rate and the final
success rate.

## If it fails

Report which step fails and why — sleeve grasp, sleeve drags the body, or body fold. One adjustment
pass allowed (lift height or inward distance). If it still fails, say so and stop; the finding is
"this arm layout cannot fold sleeves sequentially" and that is worth keeping.

## Constraints

- Do not change the arms, the cabinet or the checks.
- The towel result must stay 55/55.
- `check.py` must pass.

## Report

The per-step table, the success rate, the failing step if any, and the adjustment you made. Do not
commit.
