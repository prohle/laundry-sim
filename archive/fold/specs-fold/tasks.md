# Fold — tasks

Ordered. Each task leaves the repo runnable. Gates are kill criteria, not reminders.

Completed and partial work lives in `.kiro/archive/tasks-done.md`. Read it only when a task
below depends on it.

## Do not retry (moved from the archive; these were tried and failed)

- Hosted Origami Simulator: loads our FOLD, collapses to a wedge with crossing faces. TreeMaker's
  own full-square model 5 fails identically, so the fault is not the dog's 0.84 coverage.
- Adding `edges_foldAngle`: not sufficient. Inverting M/V: not the cause. Both tested 2026-11-06.
- TreeFaker: no licence. Do not vendor it.
- Building TreeMaker 5 from source: not needed, `treemaker-core` reaches 0.000000 parity.

## Phase 0 — Commit the pivot (6 Nov)
Completed and partial work for this phase: `.kiro/archive/tasks-done.md#phase-0-commit-the-pivot-6-nov`

- [ ] 0.2 Retire the relief and slice generators to `_local/retired/`
- [ ] 0.3 Commit with the reason in the message


## Phase 1 — Solver parity (7–10 Nov)
Completed and partial work for this phase: `.kiro/archive/tasks-done.md#phase-1-solver-parity-7-10-nov`

- [ ] 1.2 Fallback: build TreeMaker 5 from source with `g++` and `make`
- [ ] 1.3 Pick three reference models with published crease patterns (crane, one `.tmd5`
      example, one four-legged animal)
- [ ] 1.4 Reproduce each; diff vertices and edges against the reference
      - **Scale parity: 3 of 3, exact.** Against the C++ reference's recorded ALM output
        (`solver/fixtures/tmModelTester.out.txt`): 0.517637, 0.074658, 0.056381. Measured
        differences are 0.000000 at six decimals. `solver/tests/parity.rs` enforces this.
      - Crease pattern built on models 1, 3, 4 and 5. Model 2 fails with
        `invalid operation: polygon inset distance was not found`, and the test asserts that
        exact failure so a regression is visible.
      - **Not done:** a vertex-and-edge diff of the crease pattern. The reference output
        contains no vertex or edge data, so this cannot be checked against it. Needs a
        published crease pattern instead — that is 1.3.
- [ ] 1.6 Investigate the crab tree failure (`twisted` after 6 attempts): cause and whether it
      is fixable or needs the TreeMaker 5 fallback (1.2)

## Phase 2 — Tree, pattern, assignment (10–15 Nov)
Completed and partial work for this phase: `.kiro/archive/tasks-done.md#phase-2-tree-pattern-assignment-10-15-nov`

- [ ] 2.1 Tree type: nodes, edges, lengths, strain; JSON round-trip
- [ ] 2.2 Flap budget per tier; monotonicity property test
- [ ] 2.4 Kawasaki and Maekawa checks at every interior vertex
- [ ] 2.5 Flat-folded state enumeration; report the count
- [ ] 2.6 Mountain/valley assignment where the count is one; collapse direction otherwise

## Phase 3 — Photo to tree (15–20 Nov)
Completed and partial work for this phase: `.kiro/archive/tasks-done.md#phase-3-photo-to-tree-15-20-nov`

## Phase 4 — Fold it (20–25 Nov)

- [ ] 4.1 Print and fold the Medium reference model by hand
- [ ] 4.2 Photograph it beside the source photograph
- [ ] 4.3 If it does not read, reduce the tier and refold — do not widen the claim
- [ ] 4.4 Attempt the Hard/Expert hero model only after Medium passes
- [ ] 4.5 Recognition study: same subject at four tiers, ten people, name it

**Gate, 25 Nov:** a person holds the model and recognises the subject. This decides the entry.


## Phase 5 — Interface (24–28 Nov)
Completed and partial work for this phase: `.kiro/archive/tasks-done.md#phase-5-interface-24-28-nov`

- [ ] 5.1 The ladder: one photograph, four tiers, side by side
- [ ] 5.2 3D preview of the base
- [ ] 5.3 Collapse animation: crease pattern to base
      - Findings, failed attempts and the container build: `.kiro/archive/tasks-done.md#phase-5-interface-24-28-nov`
- [ ] 5.4 Printable pattern with legend, paper size, step count, time estimate
- [ ] 5.5 Mobile at 390 px; deploy to a stable public URL
      - Findings, failed attempts and the container build: `.kiro/archive/tasks-done.md#phase-5-interface-24-28-nov`


## Phase 6 — Ship (28 Nov–2 Dec)

- [ ] 6.1 README for judges: the chimera, the ladder, the measurement, the Limits section
- [ ] 6.2 Prior work disclosure, including TreeMaker and its GPL licence
- [ ] 6.3 Record the video to the beat sheet: problem, tree, pattern, fold, refusal, close
- [ ] 6.4 Blog post and social post
- [ ] 6.5 `SUBMISSION.md` fully checked
- [ ] 6.6 Submit 2 December, screenshot the confirmation


## Phase 9 — Hollow mode (7–9 Nov, then 9.3 onward)
Spec change, 2026-11-07 (user request, option 1 approved). R9; design "Hollow mode".
Completed and partial work for this phase: `.kiro/archive/tasks-done.md#phase-9-hollow-mode-7-9-nov-then-9-3-onward`

- [ ] 9.4 Closed mesh from the hull, coarse enough to cut by hand

## Kiro artifacts to produce along the way
Completed and partial work for this phase: `.kiro/archive/tasks-done.md#kiro-artifacts-to-produce-along-the-way`

- [ ] Hook: run property tests on save
- [ ] Hook: flag spec drift when requirements change after implementation
- [ ] Steering: product voice and claims discipline (exists)
- [ ] Custom agent: the reference-model reproduction agent
- [ ] Commit history showing spec → design → tasks → implementation, in that order
