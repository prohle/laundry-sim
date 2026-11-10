# Laundry — tasks

Ordered. Each task leaves the repo runnable. One task per turn. Verify with
`sim/.venv/bin/python sim/check.py` before reporting.

## Phase 1 — The machine exists (9–11 Nov)

- [x] 1.1 `sim/garment.py`: parametric towel and tee -> OBJ, print counts and pin ids.
      Acceptance: `sim/.venv/bin/python sim/garment.py --kind towel` and `--kind tee` both write an
      OBJ; counts printed; no asset downloaded.
- [x] 1.2 `sim/scene.py` + a minimal `sim/run.py`: cabinet, shelf, garment, two cameras; load, step,
      render one frame. MJCF built as a string.
      Acceptance: `sim/.venv/bin/python sim/run.py --frames 1` writes `sim/out/frame.png`, no NaN.
- [x] 1.3 `sim/check.py`: R1-R3 assertions; exit non-zero with the failing assertion named.
      Acceptance: passes on a clean checkout; fails if the cabinet is removed from the scene.
- [x] 1.2b Gravity on and the towel resting on the shelf; top camera inside the cabinet.
      Acceptance: after 200 steps the towel z-range is 0.56-0.60, no NaN, both cameras render.
- [ ] 1.4 Extend `sim/run.py`: `--frames N`, `--video path.mp4`, `--camera`.
      Acceptance: `--frames 30` writes 30 PNGs or one mp4.

## Phase 2 — The fold works (11–14 Nov)

- [x] 2.1 Two arms with grippers in `sim/scene.py`, position servos, mirrored mounts.
- [x] 2.2 `sim/fold.py`: keyframed trajectory, weld grasp to two corners.
      Acceptance: prints `FOLDED` with the extent before/after, exit 0.
- [x] 2.2b Fold lands on the shelf and the check rejects a heap.
      - Fold target: the final strip lies within the shelf bounds (y >= -0.15, y <= 0.25). A half fold
        stacks the front half on the stationary back half, so the strip sits at y -0.15..0.0 by geometry.
      - Check in fold.py and check.py: width (x after >= 0.90 x before), depth (y after <= 0.60 y before),
        on top (mean z of moved half >= 2 mm above the stationary half). Print all six numbers.
        FOLDED only if all three pass.
      - Render sim/out/fold_mid.png (front edge passes over back edge) and sim/out/fold_end.png (after release),
        both from the `inside` camera.
      Acceptance: `sim/.venv/bin/python sim/fold.py` prints the six numbers and FOLDED;
      `cd sim && .venv/bin/python check.py` prints VERDICT: PASS (10 checks).
- [~] 2.3 Superseded by 2.2b: the extent-ratio and overlap check is replaced by width, depth and on-top.
- [x] 2.4 Render the fold: 120 frames to `sim/out/fold.mp4`, one take, no cuts.

## Phase 3 — Measure it (14–17 Nov)

- [x] 3.1 `sim/eval.py`: N seeded runs, success rate, time, wrinkle score.
      Acceptance: same seed twice gives identical numbers.
- [ ] 3.2 Baseline table: scripted fold, 20 runs. Write it to `sim/out/baseline.md`.
- [x] 3.3 Randomised drops: garment **position** ±0.04 m, yaw fixed at 0 for the baseline. Yaw is 3.6.
- [x] 3.5 Front-corner detection at yaw 0.
      Targets: the max-y vertex with x < centroid_x and the max-y vertex with x > centroid_x.
      Ground truth is known from the drop parameters, so compare to it: each target within 0.02 m of
      the true corner, separation > 0.6 m, over the 9 position drops (dx, dy in {-0.04, 0, 0.04}).
      Acceptance: 9/9 pass and the table is printed.
- [ ] 3.6 Yaw ±20°: rotated-frame corner detector. Later; not part of the baseline.
- [x] 3.7 Arm bases forward of the back wall, so the grasp targets are not at the yaw singularity.
      Move both shoulder bases to (0.05, -0.08, 0.75) and (0.75, -0.08, 0.75), reaching forward and
      down. y = -0.08 is chosen from the reach arithmetic: the farthest corner is 0.40 m away, under
      the 0.44 m limit, and both the corner and the carry target (y = -0.05) are forward of the base.
      Re-solve the ready pose. Keep link lengths, gripper and joint ranges.
      Acceptance: for the 9 position drops at yaw 0, max |shoulder| at the ready pose < 1.2 rad and
      gripper-to-corner < 0.08 m.
- [x] 3.4 Carry path reachable across the position drops.
      `d` = an inward x move applied after the lift and undone before release, to keep the pinch off
      the shoulder column. The path must not exceed any joint limit for offset in ±0.04 m at yaw 0.
      Fix the trajectory, not the joint ranges and not the randomisation.
      Acceptance: `sim/eval.py --runs 10 --seed 1` reports no NOREACH; the success rate is whatever it is.

## Phase 4 — Learn it (17–22 Nov)

- [ ] 4.1 Closed-loop policy: observe the perceived corners and the current y-extent; set the fold
target y and the lift height. A controller, not RL — stated as such.
- [ ] 4.2 Fit on training drops (seeds 1-5), evaluate on held-out drops (seeds 6-10). No tuning on test.
- [ ] 4.3 Table: scripted baseline vs closed-loop policy, same held-out seeds, same N.

## Phase 5 — Show it (22–28 Nov)

- [ ] 5.1 Cabinet lighting and camera framing pass; the hero shot reads as a machine.
- [ ] 5.2 Browser replay: MuJoCo WASM + three.js, scrub and shove.
- [ ] 5.3 Video: 2:50, script in `_local/story.md`.

## Phase 6 — Kiro artefacts (continuous)

- [ ] 6.1 MCP server `sim-tools`: `run_episode`, `eval_suite`, `render_clip`.
- [ ] 6.2 Hook: run `sim/check.py` after any write under `sim/`.
- [ ] 6.3 Steering: no fold claim without the check; no asset without a licence.
- [ ] 6.4 Property tests: vertex count, no NaN, extent monotonicity under the fold.
