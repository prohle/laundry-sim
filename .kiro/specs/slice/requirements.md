# Stratum — requirements

> Working name. Final name: Leyen, by 20 November, before the README rewrite.

## Purpose

Turn four phone photographs of an object into a stack of flat cut layers that assemble into a
physical 3D model — and measure what the fabrication constraints cost in fidelity.

## The research question

Reconstructing 3D from silhouettes is cheap and robust, but the result is convex on every
horizontal slice: holes, handles and undercuts vanish. Fabrication adds a second deformation —
layers must be planar, connected, share a registration axis, and survive a cutter's minimum
feature width. Nobody has measured that compound loss for a phone-camera, laser-cut pipeline.

The contribution is the measurement, not a new solver:

1. A four-photo capture-to-cut pipeline, end to end.
2. A fabrication-aware slicing stage, with connectivity and minimum-width constraints applied
   during reconstruction rather than after it.
3. Silhouette IoU per input view, for silhouette-only and photo-consistency carving, across
   view counts of one, two and four, on a fixed fixture set that ships with the repo.

## Users

- **Maker** — has a laser cutter or a knife and card, wants a physical model of a real object.
- **Teacher** — secondary-school maths, teaching projection, cross-sections and scale. The
  stack is a cross-section diagram you can hold.

## Scope

**In:** four views at 90°, object upright, near-orthographic, opaque, rigid, with a clear
silhouette. Laser cutting or hand cutting. Stacked horizontal layers.

**Out:** arbitrary 3D reconstruction, single-photo reconstruction, soft or transparent objects,
undercuts that silhouettes cannot see, robot assembly, curved-layer fabrication.

## Requirements

### R1 — Capture

- R1.1 Accept four photos labelled front, right, back, left.
- R1.2 Segment each photo into a foreground silhouette.
- R1.3 Refuse and explain if any view is missing, if a silhouette covers more than 90% or less
  than 2% of its frame, or if the four silhouettes disagree on the object's height by more than
  15%. It must not guess.
- R1.4 Align the four views on a common vertical axis and a common scale, derived from the
  silhouette bounding boxes. Show the alignment, and let the user nudge it.
- R1.5 State the capture protocol on screen before the first photo is taken.

### R2 — Reconstruct

- R2.1 Build a voxel occupancy grid by carving with all four silhouettes.
- R2.2 Refine the grid by photo consistency: carve a voxel whose colour disagrees across the
  views that can see it. This is what recovers concavities the silhouettes cannot.
- R2.3 Reconstruction is deterministic: the same four photos and the same settings produce the
  same grid, byte for byte after serialisation.
- R2.4 Report per-view reprojection error and the fraction of the grid that is photo-consistent.

### R3 — Fabricate

- R3.1 Slice the grid into horizontal layers at a stated material thickness.
- R3.2 Every layer is one connected region. Disconnected islands are bridged to the main body
  by the shortest connector that clears the minimum feature width.
- R3.3 Every layer carries a registration feature on the shared vertical axis.
- R3.4 Minimum feature width is a parameter, defaulting to kerf plus two material thicknesses.
- R3.5 Export one SVG per layer, plus a combined layout at a stated page size, with the layer
  index engraved on each piece.
- R3.6 Emit a **slice plan**: versioned JSON containing every layer's polygons, the registration
  axis, the material parameters and the fidelity numbers. This is the intermediate
  representation; the SVG is one renderer of it.

### R4 — Present

- R4.1 Orbitable 3D preview of the reconstructed model.
- R4.2 Layer-stepping preview of the assembled stack: show layers one at a time, in order.
- R4.3 Assembly instructions: layer count, material, stacking order, axis.
- R4.4 The interface states the supported object class and the convexity limit, in the interface
  itself, not only in the README.

### R5 — Measure

- R5.1 For each input view, reproject the reconstructed model and compute silhouette IoU against
  the captured silhouette.
- R5.2 Report silhouette-only against silhouette-plus-photo-consistency.
- R5.3 Report IoU against view count, one, two and four, on the fixture set.
- R5.4 The measurement is reproducible from the repo: fixtures, script, and a written protocol.

### R6 — Honesty

- R6.1 Never claim general 3D reconstruction or "any object".
- R6.2 Name the failure mode where it happens: concavities lost to silhouettes, undercuts lost to
  layers, scale lost to an uncalibrated camera.
- R6.3 No claim of material generality beyond the stated card and plywood thicknesses.

## Non-functional

- N1 First result within 20 seconds of the fourth photo on a laptop.
- N2 Works at 390 px width.
- N3 No image leaves the device. State it in the interface.
- N4 The slice plan is serialisable and versioned, so a January CNC or robot renderer can consume
  plans produced in December.

## Acceptance

A person who has never used the tool photographs a bottle from four sides, exports the layers,
cuts twelve of them, stacks them on a dowel, and gets an object whose silhouette from each of the
four directions matches the photo they took — without asking for help.
