# Fold — tasks

Ordered. Each task is small enough to finish in a sitting and leaves the repo runnable.

## Phase 1 — Skeleton (5–6 Nov)

- [ ] 1.1 Create the public repo: MIT license, About section, `/.kiro/` at root
- [ ] 1.2 Scaffold the app (framework of choice) with a page that accepts an upload
- [ ] 1.3 Wire segmentation: photo in, mask out, displayed side by side
- [ ] 1.4 Add the mask sanity check (R1.3) and the refusal message

## Phase 2 — Height field (7–9 Nov)

- [ ] 2.1 Crop to mask, square, resample to N×N
- [ ] 2.2 Compute luminance term
- [ ] 2.3 Compute distance-to-edge term
- [ ] 2.4 Combine, normalise, quantise to K levels
- [ ] 2.5 Render the height field as a greyscale grid for inspection

**Check:** the grid visibly resembles the subject at N=16, K=4.

## Phase 3 — Fold plan (10–13 Nov)

- [ ] 3.1 Compute fold angles and directions between adjacent cells
- [ ] 3.2 Emit the JSON plan (schema v1)
- [ ] 3.3 Topologically sort operations by dependency
- [ ] 3.4 Implement round-trip verification (fold, unfold, assert flat)
- [ ] 3.5 Property-based tests for R2.4 and R2.5

**Gate, 15 Nov:** three object classes produce plans that a human can see a path through.

## Phase 4 — Human renderer (16–19 Nov)

- [ ] 4.1 2D projection of sheet state per step
- [ ] 4.2 Highlight the active hinge
- [ ] 4.3 One imperative sentence per step
- [ ] 4.4 Forward/back navigation preserving state
- [ ] 4.5 Printable template with mountain/valley legend

## Phase 4b — Animation, generated (19–22 Nov)

- [ ] 4b.1 Sheet mesh: N×N cells, shared vertices, in Three.js
- [ ] 4b.2 Apply one operation: rotate a cell group around a hinge axis
- [ ] 4b.3 Group operations into steps by flap (connected component)
- [ ] 4b.4 Animate θ over time; play, pause, scrub, step forward/back
- [ ] 4b.5 Highlight the active hinge; tint the moving flap
- [ ] 4b.6 Golden test: final mesh equals the geometry computed directly from the plan
- [ ] 4b.7 Fallback check on 20 Nov: if 3D slips, ship 2D SVG diagrams per step

## Phase 5 — Prove it (20–22 Nov)

- [ ] 5.1 Print the template for one fixture image
- [ ] 5.2 Fold it by hand, photograph the result beside the original
- [ ] 5.3 If it is not recognisable, reduce N and K, and try again — do not widen the claim

**Gate, 22 Nov:** a human folds it and the result is recognisable. This decides the entry.

## Phase 6 — Polish (23–27 Nov)

- [ ] 6.1 Interface pass: empty, loading, error, refusal states
- [ ] 6.2 Mobile layout at 390 px
- [ ] 6.3 Deploy to a stable public URL
- [ ] 6.4 Record the video: photo → pattern → fold → result
- [ ] 6.5 Write the Kiro usage note from the real artifacts (specs, hooks, steering, MCP, PBT)

## Phase 7 — Ship (28 Nov–2 Dec)

- [ ] 7.1 README rewritten for judges
- [ ] 7.2 Prior work disclosure in README and submission text
- [ ] 7.3 Blog post and social post
- [ ] 7.4 `SUBMISSION.md` fully checked
- [ ] 7.5 Submit 2 December, screenshot the confirmation

## Kiro artifacts to produce along the way

- [ ] Hook: run property-based tests on save
- [ ] Hook: flag a spec drift when requirements change after implementation
- [ ] Steering: product voice and the "never claim any object" rule
- [ ] MCP: a small server exposing the fixture image set to the agent
- [ ] Commit history showing spec → design → tasks → implementation, in that order
