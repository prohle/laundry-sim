# Fold — tasks

Ordered. Each task leaves the repo runnable. Gates are kill criteria, not reminders.

## Phase 0 — Commit the pivot (6 Nov)

- [x] 0.1 Spec rewritten for origami; category locked as Frankenstein
- [ ] 0.2 Retire the relief and slice generators to `_local/retired/`
- [ ] 0.3 Commit with the reason in the message

## Phase 1 — Solver parity (7–10 Nov)

- [ ] 1.1 Evaluate TreeFaker: does it solve a known tree and emit a crease pattern?
- [ ] 1.2 Fallback: build TreeMaker 5 from source with `g++` and `make`
- [ ] 1.3 Pick three reference models with published crease patterns (crane, one `.tmd5`
      example, one four-legged animal)
- [ ] 1.4 Reproduce each; diff vertices and edges against the reference
- [ ] 1.5 Write down the parity result, pass or fail, with the numbers

**Gate, 10 Nov:** parity on at least two of three. Fail → box-pleating only, and the claim narrows
to "box-pleated animals".

## Phase 2 — Tree, pattern, assignment (10–15 Nov)

- [ ] 2.1 Tree type: nodes, edges, lengths, strain; JSON round-trip
- [ ] 2.2 Flap budget per tier; monotonicity property test
- [ ] 2.3 Crease pattern from the solver, as FOLD
- [ ] 2.4 Kawasaki and Maekawa checks at every interior vertex
- [ ] 2.5 Flat-folded state enumeration; report the count
- [ ] 2.6 Mountain/valley assignment where the count is one; collapse direction otherwise

**Gate, 15 Nov:** one pattern passes local flat-foldability and prints with a legend.

## Phase 3 — Photo to tree (15–20 Nov)

- [ ] 3.1 Silhouette → medial axis / skeleton
- [ ] 3.2 Skeleton → tree with limb lengths, normalised to the square
- [ ] 3.3 Minimum-tier computation from the tree
- [ ] 3.4 Human-in-the-loop correction: drag, lengthen, delete
- [ ] 3.5 Refusal states: no limbs, too many limbs, packing fails

**Gate, 20 Nov:** three subjects produce trees that a human accepts after at most two corrections.

## Phase 4 — Fold it (20–25 Nov)

- [ ] 4.1 Print and fold the Medium reference model by hand
- [ ] 4.2 Photograph it beside the source photograph
- [ ] 4.3 If it does not read, reduce the tier and refold — do not widen the claim
- [ ] 4.4 Attempt the Hard/Expert hero model only after Medium passes
- [ ] 4.5 Recognition study: same subject at four tiers, ten people, name it

**Gate, 25 Nov:** a person holds the model and recognises the subject. This decides the entry.

## Phase 5 — Interface (24–28 Nov)

- [ ] 5.1 The ladder: one photograph, four tiers, side by side
- [ ] 5.2 3D preview of the base
- [ ] 5.3 Collapse animation: crease pattern to base
- [ ] 5.4 Printable pattern with legend, paper size, step count, time estimate
- [ ] 5.5 Mobile at 390 px; deploy to a stable public URL

## Phase 6 — Ship (28 Nov–2 Dec)

- [ ] 6.1 README for judges: the chimera, the ladder, the measurement, the Limits section
- [ ] 6.2 Prior work disclosure, including TreeMaker and its GPL licence
- [ ] 6.3 Record the video to the beat sheet: problem, tree, pattern, fold, refusal, close
- [ ] 6.4 Blog post and social post
- [ ] 6.5 `SUBMISSION.md` fully checked
- [ ] 6.6 Submit 2 December, screenshot the confirmation

## Kiro artifacts to produce along the way

- [ ] Hook: run property tests on save
- [ ] Hook: flag spec drift when requirements change after implementation
- [ ] Steering: product voice and claims discipline (exists)
- [ ] MCP: a server exposing the reference models to the agent
- [ ] Custom agent: the reference-model reproduction agent
- [ ] Commit history showing spec → design → tasks → implementation, in that order
