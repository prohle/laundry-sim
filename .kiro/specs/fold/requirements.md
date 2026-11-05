# Fold — requirements

## Purpose

Turn a photograph of an object into a crease pattern and a fold plan a person can follow, so that
folding paper becomes a way to teach spatial reasoning with whatever is on the desk.

## Users

- **Teacher** — photographs an object, hands the pattern to a class.
- **Student** — folds from the steps, without diagram literacy.

## Scope

In: photographs of objects with a clear silhouette, one constrained fold family, step rendering,
printable template.
Out: arbitrary origami design, wet folding, curved creases, robot execution (January).

## Requirements

### R1 — Capture and segment
- R1.1 The system accepts a photo from a phone camera or file upload.
- R1.2 It produces a foreground mask with the subject isolated from the background.
- R1.3 If the mask covers more than 90% or less than 2% of the frame, the system reports that it
  cannot find an object and stops. It must not guess.

### R2 — Derive the fold plan
- R2.1 The system converts the masked subject into a height field on a fixed grid.
- R2.2 It generates a crease pattern in which every crease is foldable by construction.
- R2.3 It emits a **fold plan**: an ordered list of operations, each with a crease line, a
  direction (mountain or valley), an angle, and the flap affected.
- R2.4 Every plan is reversible: applying the inverse operations returns the sheet to flat.
- R2.5 Every plan is deterministic: the same photo and settings produce the same plan.

### R3 — Render for a human
- R3.1 The plan renders as an ordered sequence of steps with a diagram and one sentence each.
- R3.2 The step text is sufficient without the diagram.
- R3.3 The user can step forwards and backwards without losing state.

### R4 — Export
- R4.1 The system exports a printable crease template at a stated paper size.
- R4.2 The template marks mountain and valley creases distinguishably in greyscale.

### R5 — Honesty
- R5.1 The interface states the supported class of objects.
- R5.2 When the output is a relief rather than a recognisable model, the interface says so.
- R5.3 No claim of general-purpose origami design appears anywhere in the product.

## Non-functional

- N1 First result within 10 seconds of upload on a laptop.
- N2 Works in a mobile browser at 390 px width.
- N3 No image is stored server-side beyond the request. State this in the UI.
- N4 The fold plan is serialisable JSON and versioned, so the January machine renderer can consume
  plans produced in December.

## Acceptance

A person who has never folded origami photographs a mug, follows the steps, and produces a folded
object they recognise as derived from the mug — without asking for help.
