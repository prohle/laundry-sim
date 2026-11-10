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
- [ ] 1.3 `sim/check.py`: R1-R3 assertions; exit non-zero with the failing assertion named.
      Acceptance: passes on a clean checkout; fails if the cabinet is removed from the scene.
- [x] 1.2b Gravity on and the towel resting on the shelf; top camera inside the cabinet.
      Acceptance: after 200 steps the towel z-range is 0.56-0.60, no NaN, both cameras render.
- [ ] 1.4 Extend `sim/run.py`: `--frames N`, `--video path.mp4`, `--camera`.
      Acceptance: `--frames 30` writes 30 PNGs or one mp4.

## Phase 2 — The fold works (11–14 Nov)

- [ ] 2.1 Two arms with grippers in `sim/scene.py`, position servos, mirrored mounts.
- [ ] 2.2 `sim/fold.py`: keyframed trajectory, weld grasp to two corners.
      Acceptance: prints `FOLDED` with the extent before/after, exit 0.
- [ ] 2.3 Fold check in `sim/check.py`: extent ratio and overlap, both printed.
- [ ] 2.4 Render the fold: 120 frames to `sim/out/fold.mp4`, one take, no cuts.

## Phase 3 — Measure it (14–17 Nov)

- [ ] 3.1 `sim/eval.py`: N seeded runs, success rate, time, wrinkle score.
      Acceptance: same seed twice gives identical numbers.
- [ ] 3.2 Baseline table: scripted fold, 20 runs. Write it to `sim/out/baseline.md`.
- [ ] 3.3 Randomised drops: garment position and rotation from the seed.

## Phase 4 — Learn it (17–22 Nov)

- [ ] 4.1 Policy skeleton: observation, action, episode loop.
- [ ] 4.2 Train against the eval, log every attempt.
- [ ] 4.3 Table: baseline vs learned, same seeds, same N.

## Phase 5 — Show it (22–28 Nov)

- [ ] 5.1 Cabinet lighting and camera framing pass; the hero shot reads as a machine.
- [ ] 5.2 Browser replay: MuJoCo WASM + three.js, scrub and shove.
- [ ] 5.3 Video: 2:50, script in `_local/story.md`.

## Phase 6 — Kiro artefacts (continuous)

- [ ] 6.1 MCP server `sim-tools`: `run_episode`, `eval_suite`, `render_clip`.
- [ ] 6.2 Hook: run `sim/check.py` after any write under `sim/`.
- [ ] 6.3 Steering: no fold claim without the check; no asset without a licence.
- [ ] 6.4 Property tests: vertex count, no NaN, extent monotonicity under the fold.
