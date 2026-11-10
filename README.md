# Laundry

A simulated laundry-folding cabinet: two arms, a garment, and an evaluation harness that decides
whether the fold worked. It revives the **Laundroid** — the $16,000 folding machine that was
demonstrated, pre-ordered and bankrupted in 2019 — as software.

> A policy folds a simulated garment, measured over seeded runs. The machine was never built.

**Live page:** https://prohle.github.io/laundry-sim/
**Repo:** https://github.com/prohle/laundry-sim

Category: **Resurrection**, Kiroween 2026. Built with Kiro.

## The claim, precisely

- The fold is **simulated** in MuJoCo. There is no physical machine and no physical fold.
- A fold counts only when three geometric checks pass: width preserved, depth halved, moved half on
  top. A heap fails all three.
- Every number below comes from `sim/eval.py`, is seeded, and reproduces.

## What it does

1. `sim/garment.py` generates a towel or a T-shirt from parameters — no downloaded meshes.
2. `sim/scene.py` builds the cabinet, shelf, two actuated arms and cameras as MJCF.
3. `sim/fold.py` runs the scripted fold: grasp two front corners, lift, carry back, lower, release.
4. `sim/check.py` runs 16 checks in about 85 s; a Kiro hook runs it after every write.
   `sim/test_props.py` runs five Hypothesis properties (66 examples).
5. `sim/eval.py` runs N seeded drops and reports a table.
6. `sim/video.py` renders the fold to 1280x720, 120 frames, 4.0 s.

## What is measured

Held-out drops, position randomised ±0.04 m, yaw fixed at 0. `patch` is the radius of cloth carried by
the kinematic grasp.

| config | all runs | success | unseen drops only |
|---|---|---|---|
| patch 0.12 m | 100 | 70/100 | **35/55** (10 distinct) |
| patch 0.16 m | 100 | **100/100** | **55/55** (10 distinct) |

- Depth after the fold: 0.49–0.59 against a 0.60 threshold. Width: 0.91–0.98 against 0.90.
- Mean simulated time 2.8 s. Mean wrinkle 0.018 (0.012 at patch 0.12) — a proxy, not a measurement.
- **The 100 runs are 19 distinct drops**, because run `i` of seed `s` draws from `rng(s+i)` and the
  seeds overlap. The 55 unseen runs are 10 distinct drops. That is the honest sample size.
- The patch fix was found on seeds 6–10, so those seeds are not held-out for it. Seeds 11–20 were run
  afterwards and the 10 drops never drawn before are reported separately.

## Negative results, kept

- **Friction grasp: 0/10 against 10/10 kinematic** on the same drops, at two closing forces. The cloth
  never leaves the shelf. The gripper is two vertical plates that close sideways on a flat sheet lying
  on a shelf; there is no edge to pinch, and the closing force is 0.1–0.2 N. The fix is a finger that
  slides under the edge, which is a mechanism change, not a tuning change.
- **3 cm more forearm: 0/50.** The upper joint hits its −2.4 rad limit at the carry target on every
  run. A longer forearm must fold the upper link further back, so it trades reach for a singularity.
- **A relative fold target, fitted on seeds 1–5: 32/50 on seeds 6–10, identical to the scripted
  baseline.** The limit was the machine's geometry, not the policy.

All three are in `sim/out/`. Together they are the point of the project: **the simulator found three
mechanical limits in a day, before any hardware existed.** A company that builds the cabinet first
finds them after the tooling is paid for.

## Limits

- **Simulated only.** No machine, no fabric, no physical proof.
- **One garment, one fold.** A 0.70 x 0.40 m towel, folded in half along its depth. The T-shirt
  generator exists but is not folded.
- **Kinematic grasp in the shipped result.** The held cloth is moved to the gripper, not gripped by
  friction. A contact grasp was tried and failed 0/10; the cause is the finger geometry, above.
- **10 independent drops.** The 100% is real but the sample is small, and the README says so.
- **Wrinkle is a proxy** (mean edge strain), not a measurement of appearance.
- **Yaw is fixed at 0** for the baseline. A rotated garment needs a rotated-frame corner detector
  (task 3.6, unbuilt).

## How to run

```
cd sim
.venv/bin/python check.py                 # 16 checks, ~85 s
.venv/bin/python test_props.py            # 5 Hypothesis properties
.venv/bin/python eval.py --runs 10 --seed 11
.venv/bin/python fold.py                  # one nominal fold, FOLDED
.venv/bin/python video.py                 # sim/out/fold.mp4
```

Needs Python 3.12, MuJoCo 4.0, NumPy, Pillow and `ffmpeg`. The venv is `sim/.venv` (gitignored).

## How Kiro was used

`.kiro/specs/laundry/` holds requirements, design and tasks. `.kiro/steering/` holds the product
claims and the credit rules. `.kiro/agents/sim-builder.json` defines the agent, a write hook that runs
the check, and the `sim-tools` MCP server. Full writeup in `docs/kiro-usage.md`.

## Prior work

This repository's history contains an earlier attempt built during the same submission period (Fold, a
photo-to-origami pipeline, retired 2026-11-09). All work in it was created after 30 October 2026. The
entry is the product described above.

Dependencies: MuJoCo (Apache-2.0), NumPy, Pillow, ffmpeg. No third-party meshes, textures or assets.

## Licence

AGPL-3.0. See `LICENSE`.
