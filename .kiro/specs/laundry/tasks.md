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
- [x] 2.5 Friction grasp: 0/10 at kp 40 and 80 vs 10/10 kinematic. Cause: vertical fingers cannot pinch a flat sheet.
      Enable contact on the finger pads (condim 6, high friction), close them on the front edge, lift.
      One attempt: report the success rate on seeds 11-20 and the gap against the kinematic 55/55.
      Do not tune for more than one pass; the gap is the result.
      Acceptance: `sim/eval.py --policy friction --runs 10 --seed 11` prints a table; the gap is reported.
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

- [x] 4.1 Closed-loop policy: observe the perceived corners and the current y-extent; set the fold
target y and the lift height. A controller, not RL — stated as such.
- [x] 4.2 Fit on training drops (seeds 1-5), evaluate on held-out drops (seeds 6-10). No tuning on test.
- [x] 4.3 Table: scripted baseline vs closed-loop policy, same held-out seeds, same N.
- [~] 4.4 Forearm 0.20 -> 0.23 m: close the depth gap. TRIED, FAILED: 0/50, upper joint at -2.403 rad on every run. A longer forearm must fold the upper link further back to reach y=-0.05, so it trades reach for a joint-limit singularity.
      The failures miss the 0.60 depth threshold by 1-9 mm and the reach limit is 0.44 m against a
      0.372 m farthest corner. Lengthen the forearm by 3 cm, re-solve the trajectory, re-run seeds 6-10.
      This is a machine iteration, stated as such, not tuning.
      Acceptance: the held-out table is printed and compared to the 32/50 baseline; the result is
      reported as it comes out.

- [x] 4.5 Grasp patch 0.12 -> 0.16 m: 50/50 on seeds 6-10 (14 distinct drops), up from 32/50.
      The held patch is the cloth the kinematic grasp carries. A wider patch drags more of the front
      edge, so the fold should be tighter and the final depth smaller.
      Acceptance: the held-out table (seeds 6-10) is printed and compared to 32/50. If it does not
      beat 32/50, report it and stop the mechanism search.

- [x] 4.6 Clean test: patch 0.16 55/55 vs 0.12 35/55 on 10 unseen drops.
      Seeds 6-10 were used to find the patch fix, so they are no longer held-out. Run both configs
      (patch 0.12 and 0.16) on seeds 11-20, 10 runs each, and report the table. Do not tune anything.
      Acceptance: both success rates printed, distinct-drop count stated, written to `sim/out/clean.md`.

## Phase 5 — Show it (22–28 Nov)

- [ ] 5.1 Cabinet lighting and camera framing pass; the hero shot reads as a machine.
- [ ] 5.2 Browser replay: MuJoCo WASM + three.js, scrub and shove.
- [ ] 5.3 Video: 2:50, script in `_local/story.md`.

## Phase 5b — Real garments (10–14 Nov)

- [x] 5.4 Garment family: tee, pants, shorts, dress. Parametric shapes plus named landmarks
      (sleeve tips, waist corners, hems, crotch). No assets.
      Acceptance: each kind writes an OBJ; landmarks printed; no degenerate triangles.
- [x] 5.5 Fold-program executor: a fold is a list of steps (grasp, carry, release), each with its own
      check. Replaces the single scripted trajectory.
      Acceptance: the towel still folds 55/55 via a one-step program.
- [ ] 5.8 Scale the machine to a real garment.
      Reach is 0.44 m; a 0.60 m tee's hem and shoulders are 0.45 m from the arm base, so no program
      reaches them. Enlarge: cabinet 1.20 x 0.80 x 1.40, shelf at 0.70, links 0.35 + 0.30 (reach 0.65),
      bases at (0.15, -0.10, 0.95) and (1.05, -0.10, 0.95). Re-solve the towel trajectory and the tee
      program. The towel must still fold 55/55 on the unseen drops after scaling.
      Acceptance: towel 55/55; tee reachable (grip-to-landmark < 0.08 m at the hem and shoulders).
- [ ] 5.6 T-shirt fold program: left sleeve in, right sleeve in, body in half. Gate: >= 6/10 on 10
      unseen drops, or the multi-garment claim is dropped.
- [ ] 5.7 Pants and shorts programs, only if 5.6 passes.

- [x] 5.9 Live page: replace the retired Fold Next.js page with a Laundry product page (hero video,
      result toggle, limits, run instructions, Kiro, footer). Rename the package. No Fold references.
      Acceptance: `npm run build` exits 0; the page returns 200 and contains "simulated" and "55/55".

- [x] 5.10 Static export + GitHub Pages workflow, so the page has a live URL.
      Acceptance: `STATIC_EXPORT=1 NEXT_PUBLIC_BASE_PATH=/laundry-sim npm run build` writes `out/`
      with the video and `_next` under `/laundry-sim/`; the default build still succeeds.

## Phase 7 — The folding board (11–14 Nov)

Reference: `docs/folds.md`. The arms become the loader; the board does the folding.

- [x] 7.1 Board, four flaps and a smoothing bar in `scene.py`; the garment lies on the board.
      Flaps hinged at the board edges, position actuators, 0..180 degrees. Contact between flaps and
      cloth enabled. Four cameras: top, side_l, side_r, front.
      Acceptance: `sim/run.py --frames 1 --camera top` shows the garment on the board; each flap
      rotates 90 degrees in a scripted test without NaN.
- [ ] 7.2 Towel fold as a flap program: bottom, top. Re-run the eval; the number changes and is reported.
- [ ] 7.5 Move `extent_monotone` from the arms path to the flap path; the arms are the loader.
- [~] 7.6 Blade fold and cloth bending stiffness: one sweep, one clean half fold (area ratio ~0.5).
      Brief 39: `flapfold.py --mode blade|flap --young Pa --sweep list`. Decision rule: ratio 0.4-0.6 and on-centre > 60%.
- [x] 7.7 T-shirt half fold with the arms (hem to shoulders), on the board. The garment is real even if
      the fold is one step. Unblock: widen the upper joint range to [-2.6, 1.0] (the -2.4 limit was
      arbitrary and the hem needs -2.402), and carry the hem to y = 0.40 (the shoulder line), not 0.05.
- [ ] 7.3 T-shirt fold as a flap program: left, right, bottom, top (retail fold).
      Gate: >= 6/10 on 10 unseen drops.
- [ ] 7.4 Multi-view render: a 2x2 contact sheet (top, side_l, side_r, front) per fold, and a video
      cut from the top and one side.

- [x] 7.8 Two failing checks in sim/check.py, both marginal. Investigate before loosening.
      a) flap-carries: print the measured lift for all four flaps. If only the front flap is
         below 5 mm and it matches the 7.1 report, lower the threshold to 3 mm with a comment
         (least overhang, lifts the least cloth). If the front carry has dropped since 7.1,
         report it as a board regression and leave the threshold.
      b) props extent_monotone, seed 2 grows 8.5%: find the phase. If the growth is in the
         settle after release, sample only the lift-and-carry and keep the 5% tolerance. If
         it is in the fold itself, raise the tolerance to 10% with a comment naming seed 2,
         and report towel and tee growth separately. Do not delete the property.
      Acceptance: `sim/.venv/bin/python sim/check.py` prints VERDICT: PASS (20 checks) and
      both checks print their measured numbers. Commit with the task number.

## Phase 8 — The wardrobe (15–17 Nov)

One fold per garment, along the board's depth axis. The fixed symmetric arms cannot fold along the
width axis (both grasp points would sit on one side; the far arm cannot reach), so the legs-together
fold for pants is out of reach with this machine — that is limit 7, documented. Garments are scaled to
the board; the README says so.

- [x] 8.1 Tee at full strength: 100/100, 19 distinct drops: the 100-run clean protocol (seeds 11-20), same as the towel's 55/55.
- [x] 8.2 Pants, shorts, dress on the half-fold program.
      Scale to the board: pants W 0.44 x H 0.70 inseam 0.40; shorts W 0.44 x H 0.55 inseam 0.28;
      dress W 0.40 (hem 0.50) x H 0.70. Same program as the tee: grasp hem_l/hem_r, carry to the
      front edge minus 0.10 m. Wire --clean for every garment.
      Acceptance: each garment runs the clean protocol and writes its table to sim/out/.
- [ ] 8.4 `video.py --garment <kind>`: render every garment's half fold to sim/out/fold-<kind>.mp4.
- [x] 8.3 The wardrobe table (see 8.5): one command, all garments, success rates side by side; written to
      sim/out/wardrobe.md and shown on the page.

- [x] 8.5 The wardrobe on the page: `sim/wardrobe.py` writes `sim/out/wardrobe.md` from the five clean
      tables (no eval re-run). Page: garment selector (default tee) switching hero video and highlighted
      row, wardrobe table, seed-overlap caveat, dress failing-drop sentence, rewritten limits.
      Acceptance: `sim/wardrobe.py`, `npm run build` and the `STATIC_EXPORT=1` build exit 0; dress at 92.

## Phase 9 — Fold pre-phases (15–17 Nov)

- [x] 9.1 Square-settle-align prologue, then one flap retry.
      Square: arms grasp the shoulders, lift 3 cm, settle 500 steps, lower. Align: the garment's
      fold line within 1 cm of the left hinge; if not, the arms carry it until it is. Then one
      four-flap retail fold with the prologue.
      TRIED, FAILED: even squared, settled and aligned, the flaps still drag the cloth through the
      board (area 0.277, mean z 23.7 mm BELOW the board, on-centre 25%). Negative result 8. The arms
      half-fold wardrobe remains the shipped result.

## Phase 6 — Kiro artefacts (continuous)

- [ ] 6.1 MCP server `sim-tools`: `run_episode`, `eval_suite`, `render_clip`.
- [ ] 6.2 Hook: run `sim/check.py` after any write under `sim/`.
- [ ] 6.3 Steering: no fold claim without the check; no asset without a licence.
- [x] 6.4 Property tests (Hypothesis): vertex count, single component, no NaN, extent monotonicity,
      determinism. Run by `sim/test_props.py`.
