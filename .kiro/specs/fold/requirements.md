# Fold — requirements

> Product: **Fold**. Category: **Frankenstein**. Deadline: **4 December 2026, 2:00 pm PT**.
> Committed 2026-11-06.

## Purpose

Turn a photograph of an object into an origami crease pattern a person can fold, at a complexity
the person chooses.

## The chimera

Four elements that do not belong together, stitched into one app:

| Element | Era | Why it is incompatible |
|---|---|---|
| A camera | 2026 | records light, instant, digital |
| Tree theory | 1970s | graph mathematics almost nobody can operate |
| TreeMaker | 2006 | abandoned research C++, does not run on modern systems |
| A sheet of paper | forever | material, slow, tactile |

The stitch is that **a photograph becomes a piece of paper**. The output leaves the screen.

## Users

- **Teacher** — secondary maths or science, no design skill, twenty minutes to prepare a lesson.
- **Hobbyist** — folds well, cannot design, will spend two hours on a hard model.

Both are served by the same pipeline at different complexity tiers. That is the point of the
ladder, and it is the honest answer to "who is this for".

## Scope

**In:** one photograph; objects with a clear silhouette and limbs; four to twelve flaps; a single
square of paper; fold-only, no cuts, no glue.

  Spec change, 2026-11-06 (user request): multi-sheet models: a subject needing more than twelve
  flaps is split into parts, each folded from its own square and joined at a tab with glue or a slot.

**Out:** arbitrary objects; faces; anything where a single part needs more than twelve flaps; kirigami; wet folding;
curved creases; robot folding (January).

## Requirements

### R1 — Capture

- R1.1 Accept one to four photographs of the same subject from a phone camera or a file.
  - Spec change, 2026-11-06 (user request): was "one photograph".
- R1.2 Segment the subject and extract its silhouette.
- R1.3 Refuse if the silhouette covers more than 90% or less than 2% of the frame, or if it has
  no distinguishable limbs. It must not guess.
- R1.4 With more than one photograph, analyse each view on its own. Among the views that fold, use
  the one with the most leaves; the penalised score breaks ties. Report every view with its leaf
  count, minimum tier and whether it folds.
  - Spec change, 2026-11-06 (user request). Wording reconstructed from the user's description; the
    original draft was not available to the builder.
- R1.5 If the views do not find the same number of flaps, or one does not fold, say so in plain
  words and name each count ("view 1 found 4 flaps ... view 2 found 6 flaps"). A view that hides a
  limb finds fewer flaps; the product does not average or merge views.
  - Spec change, 2026-11-06 (user request). Same note as R1.4.

### R2 — Derive a stick figure

- R2.1 Reduce the silhouette to a **tree**: a stick figure with a flap count and edge lengths.
- R2.2 Propose the tree automatically and show it over the photograph.
- R2.3 Let the user correct it: drag a leaf, lengthen an edge, delete a limb.
- R2.4 The tree is the design artefact. It is serialisable and versioned.

### R3 — Complexity ladder

- R3.1 Offer four tiers: Easy, Medium, Hard, Expert.
- R3.2 Each tier fixes a flap budget, a grid size, an expected step count, a time estimate and a
  paper requirement.
- R3.3 Compute the **minimum tier** for the subject. A subject whose structure needs more flaps
  than a tier allows cannot be built at that tier.
- R3.4 Refuse below the minimum, with a reason: "four flaps cannot make six legs".
- R3.5 Tiers are monotone: Easy is a simplification of Medium, not a different subject.

### R4 — Solve

- R4.1 Pack the tree into the square by circle/river packing, maximising scale.
- R4.2 Generate the crease pattern from the packing.
- R4.3 Verify local flat-foldability at every interior vertex (Kawasaki, Maekawa).
- R4.4 Enumerate valid flat-folded states. Report the count.
- R4.5 Where the state count is one, print a full mountain/valley assignment. Where it is greater
  than one, name the collapse and the push direction instead.

### R5 — Render for a human

- R5.1 Orbitable 3D preview of the folded base.
- R5.2 The collapse animated as one motion: crease pattern to base.
- R5.3 Printable crease pattern with a mountain/valley legend and the paper size.
- R5.4 Paper requirement stated per tier, derived from grid size and layer count.
- R5.5 Step count and time estimate stated before the user prints.

### R6 — Honesty

- R6.1 State the supported class on screen: four to twelve flaps, objects with limbs.
- R6.2 State the minimum tier for the subject, and why.
- R6.3 Never claim "any object". Never claim kirigami. Never claim a faithful replica.
- R6.4 Show the refusal case in the product, not only in the video.
- R6.5 The single-sheet claim stays "one square, no cuts, no glue". A multi-sheet model must never
  use that sentence.
  - Spec change, 2026-11-06 (user request).

### R8 — Multi-sheet models

Spec change, 2026-11-06 (user request).

- R8.1 Split at the highest-degree node into the subtrees hanging off that node, recursively, until
  every part has 12 or fewer leaves.
- R8.2 Every leaf appears in exactly one part; the sum of part leaves equals the original leaf count.
- R8.3 Each part is solved and checked on its own. The view folds only if every part folds.
- R8.4 The assembly note names the shared junction and the number of parts, and states that a
  multi-sheet model is joined at a tab and needs glue or a slot.

### R7 — Measure

- R7.1 Measure recognition against complexity: the same subject at four tiers, shown to people,
  asked to name it.
- R7.2 The minimum-tier rule is derived from that measurement, not from taste.
- R7.3 Report the numbers in the interface and the README.

## Non-functional

- N1 First crease pattern within 20 seconds of upload on a laptop.
- N2 Works at 390 px width.
- N3 No photograph is stored. Each request processes the image in memory for the duration of the
  request and discards it. Nothing is written to disk and nothing is logged. The response contains
  geometry only.
  - Spec change, 2026-11-06 (user decision): replaces "No photograph leaves the device". The
    solver is a Rust binary and a WASM port is not a 28-day item, so the pipeline runs on a
    server and the photograph is uploaded to it. This is a deliberate trade against the
    original claim; the interface must not say the photograph stays on the device.
- N4 The tree and the crease pattern are serialisable and versioned, so a January machine
  renderer can consume them.

## Acceptance

A teacher photographs an animal on her desk, picks a tier, prints the pattern, and folds a model
that a colleague recognises as that animal — without asking for help.

## Prior work

No pre-existing application code. Built during the submission period. TreeMaker's model is GPL and
is used as a library; the port and its licence are disclosed in the README.
