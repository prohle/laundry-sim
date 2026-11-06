# Stratum — tasks

Ordered. Each task leaves the repo runnable. The fun path ships first; the research rides on top.

## Phase 0 — Pivot (6 Nov)

- [ ] 0.1 Retire the relief generator; keep it in `_local/retired/` and out of the repo
- [ ] 0.2 Rewrite `.kiro/specs/slice/`; update steering
- [ ] 0.3 Commit the pivot with the reason in the message

## Phase 1 — Capture (7–9 Nov)

- [ ] 1.1 Capture screen: four labelled slots, protocol text, one photo each
- [ ] 1.2 Segment each photo; show four silhouettes side by side
- [ ] 1.3 Alignment: common vertical axis and scale from bounding boxes; draw the overlay
- [ ] 1.4 Refusal states: missing view, coverage outside 2–90%, heights disagreeing by > 15%

**Exit test:** four silhouettes of one bottle, aligned, on screen, in under 20 seconds.

## Phase 2 — Carve (10–13 Nov)

- [ ] 2.1 Voxel grid and orthographic projection for the four view angles
- [ ] 2.2 Silhouette carving, one pass
- [ ] 2.3 Surface extraction and an orbitable Three.js preview
- [ ] 2.4 Camera-direction markers so the preview explains itself
- [ ] 2.5 Property test: carving is monotone in the number of views

**Gate, 13 Nov:** a bottle and a mug read as themselves from a 3/4 view. If they do not, the
capture protocol is wrong — fix that before adding anything.

## Phase 3 — Fabricate (13–16 Nov)

- [ ] 3.1 Slice into horizontal bands at material thickness
- [ ] 3.2 Contour extraction and simplification per layer
- [ ] 3.3 Minimum-feature opening; report affected layers
- [ ] 3.4 Connectivity: bridge islands; count them
- [ ] 3.5 Registration hole on the shared axis
- [ ] 3.6 Slice plan JSON, schema v1, round-trip tested
- [ ] 3.7 SVG per layer plus a combined layout sheet with kerf compensation

**Exit test:** cut one layer from card, drop it on the rod, and it fits the stack.

## Phase 4 — Measure (16–20 Nov)

- [ ] 4.1 Reprojection and silhouette IoU per view
- [ ] 4.2 Photo-consistency carving with a threshold and a fallback
- [ ] 4.3 Fixture set: three objects, four views each, committed with consent and a source note
- [ ] 4.4 Measurement script: IoU for A, B and C, and against view count 1/2/4
- [ ] 4.5 Write the numbers into the interface

**Cut line, 20 Nov:** if B does not beat A on the fixtures, ship A, keep the measurement, and say
so in the writeup. Do not spend a second week on it.

## Phase 5 — Build it (20–25 Nov)

- [ ] 5.1 Export and cut a full stack — 3 mm ply or 1 mm card, whichever the cutter allows
- [ ] 5.2 Assemble on the rod; photograph beside the original
- [ ] 5.3 Compare the assembled silhouette to each input photo; photograph the four matches
- [ ] 5.4 If it does not read, reduce layer count and re-cut — do not widen the claim

**Gate, 25 Nov:** a person holds the object and recognises the thing they photographed. This
decides the entry.

## Phase 6 — Land it (24–28 Nov)

- [ ] 6.1 Interface pass: empty, loading, refusal, export
- [ ] 6.2 Mobile layout at 390 px
- [ ] 6.3 Deploy to a stable public URL
- [ ] 6.4 README rewritten for judges, with the measurement table and the Limits section
- [ ] 6.5 Kiro usage note written from real artifacts

## Phase 7 — Ship (28 Nov–2 Dec)

- [ ] 7.1 Record the video: four photos → model → cut → stack → four matching silhouettes
- [ ] 7.2 Prior work disclosure in README and submission text
- [ ] 7.3 Blog post and social post
- [ ] 7.4 `SUBMISSION.md` fully checked
- [ ] 7.5 Submit 2 December, screenshot the confirmation

## Kiro artifacts to produce along the way

- [ ] Hook: run the property tests on save
- [ ] Hook: flag spec drift when requirements change after implementation
- [ ] Steering: product voice and the claims discipline (already in `.kiro/steering/`)
- [ ] MCP: a server exposing the fixture set to the agent
- [ ] Commit history showing spec → design → tasks → implementation, in that order
