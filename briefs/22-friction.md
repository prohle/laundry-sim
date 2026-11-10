# Brief 22 — friction grasp, one pass

Implement task **2.5** only. This is the experiment that turns the result from "a patch fixed it" into
"here is what real contact costs". It may fail, and a failure is a publishable number.

## What to build

Replace the kinematic grasp with a **contact** grasp, behind `--policy friction`:

- Give each gripper finger pad contact: `contype="1" conaffinity="1" condim="6"`,
  `friction="1.2 0.02 0.001"`.
- Enable contact on the garment flex (`<contact contype="1" conaffinity="1" condim="3"/>`).
- Close the fingers with the existing position actuator (`grip` 0), wait 100 steps, then run the same
  lift/carry/lower/release trajectory with the arms only. **No vertex override.**
- If the cloth slips out, that is a result; record where it slipped.

## One pass only

- Try at most two closing forces (e.g. `kp` 40 and 80 on the grip actuator) and one friction value.
- If neither holds, stop, report the slip and the numbers, and keep the kinematic grasp as the shipped
  result. Do not spend the turn tuning.

## The run

```
sim/.venv/bin/python sim/eval.py --policy friction --runs 10 --seed 11
```

Report: success rate, the kinematic number on the same seeds (55/55 on the unseen drops), and the gap.
Write to `sim/out/friction.md`.

## Acceptance

- The friction table is printed and written.
- The kinematic path is unchanged and still passes `check.py` (13 checks).
- `--policy friction` is reproducible.

## Report

The table, the success rate, the gap, the slip point (grasp, lift, carry or release), and one sentence
on whether the gap is contact tuning or a real limit of the grasp. Do not commit.
