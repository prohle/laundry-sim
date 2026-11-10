# Brief 11 — inward carry, then the baseline

Approved: implement the x-move you proposed, inside task **3.4**. Run the diagnostic first and choose
the inward offset from the numbers, not by trial.

## Trajectory

1. Ready pose, close grippers.
2. Lift to z = 0.72.
3. **Move both pinch points inward in x by `d` metres**, toward the cabinet centre. Choose `d` as the
   smallest value that keeps the shoulder within its range for every yaw in ±20° and offset in
   ±0.04 m. Print the diagnostic: for `d` in 0.04, 0.08, 0.12, 0.16, the max |shoulder| over the
   range, and pick the first that stays under 2.15 rad (a margin below 2.2).
4. Carry in y to −0.05 at z = 0.72.
5. Move back out in x by `d`.
6. Lower to z = 0.62, release, settle.

## Constraints

- Do not widen the joint ranges.
- Do not change the randomisation range.
- The final width check must still pass: x-extent after >= 0.90 x before, measured **after release and
  settle**, not while held. If the inward carry leaves the cloth bunched and the width check fails,
  report the number — do not loosen the check.
- If no `d` in the list keeps the shoulder under 2.15 rad, stop and report the table.

## Then the baseline

```
sim/.venv/bin/python sim/eval.py --runs 10 --seed 1
```

Write the table to `sim/out/baseline.md` with the seed and date. Report the success rate as it is.
Do not tune the trajectory after seeing it.

## Acceptance

- No `NOREACH`.
- `check.py` passes 11 checks.
- Same seed twice gives identical numbers.

## Report

The diagnostic table, the chosen `d`, the baseline table, the success rate, mean time, mean wrinkle,
and for each failure which of width/depth/on-top failed. Do not commit; the PM reviews first.
