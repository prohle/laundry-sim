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
3. `sim/fold.py` runs the half fold for any garment: grasp the two hem corners, lift, carry to the
   front edge, lower, release.
4. `sim/check.py` runs 16 checks in about 85 s; a Kiro hook runs it after every write.
   `sim/test_props.py` runs five Hypothesis properties (66 examples).
5. `sim/eval.py` runs N seeded drops and reports a table.
6. `sim/video.py` renders the fold to 1280x720, 120 frames, 4.0 s.

## What is measured

Five garments, one fold each, the full clean protocol (seeds 11-20 x 10 runs, position randomised
+-0.04 m, yaw 0). Garments are scaled to the board.

| garment | runs | folded | distinct drops |
|---|---|---|---|
| towel | 100 | **100/100** | 19 (55/55 on the 10 unseen drops) |
| tee | 100 | **100/100** | 19 |
| pants | 100 | **100/100** | 19 |
| shorts | 100 | **100/100** | 19 |
| dress | 100 | **92/100** | 19 - one drop fails the on-top check, every time it is drawn |

Depth after each fold: 0.19-0.28 against a 0.60 threshold. Width preserved within 0.85. The moved
half sits 10-13 mm above the stationary half.

**The 100 runs are 19 distinct drops**, because run `i` of seed `s` draws from `rng(s+i)` and the
seeds overlap: the 100 runs draw rng seeds 11-29, and the **unseen subset (rng >= 20) is exactly 55
runs over 10 distinct drops** - which is where the towel's 55/55 comes from. The dress's failure is
deterministic: the drop at (dx -0.011, dy -0.024) - rng seed 22 - fails the on-top check on all eight
of its appearances, and all eight are in the unseen subset, so the dress is **47/55 unseen, 45/45
seen, 92/100 overall**. The other 18 distinct drops fold.

**Every fold lands shorter than the geometric ideal**, and the reason is physical: the arms carry the
corners, the middle sags, and the crease forms about 7 cm forward of the midline (edge stretch
1.10-1.15 corroborates). A perfect half of the tee is 0.348 m; measured 0.279 m. That is why the
depth check is <= 0.60 x and not <= 0.50 x - the threshold is set by the measured crease-walk, not
chosen to pass.

The earlier towel study (grasp patch 0.12 -> 0.16: 35/55 -> 55/55 on unseen drops) is in
`sim/out/clean.md`; it is the towel's story, not the headline.

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
- **One fold per garment**, along the board's depth axis. The fixed symmetric arms cannot fold along
  the width axis - both grasp points would sit on one side and the far arm cannot reach - so the
  legs-together fold for pants is out of reach with this machine. That is limit 7.
- **Garments are scaled to the board** (pants 0.44 x 0.70, dress 0.40 x 0.70); the README says so
  because the machine is a compact prototype.
- **Kinematic grasp.** The held cloth is moved to the gripper, not gripped by friction. A contact
  grasp was tried and failed 0/10; the cause is the finger geometry, above.
- **19 distinct drops** per garment, not 100. Yaw fixed at 0.
- **Wrinkle is a proxy** (mean edge strain), not a measurement of appearance.

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
