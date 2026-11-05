# Fold — design

## The constrained family

**Grid relief.** The sheet is divided into an N×N grid (N = 12 or 16). Each cell receives a fold
angle derived from the image, so the folded sheet becomes a textured relief that reads as the
subject when lit from the side.

Why this family: foldability is guaranteed by construction. Every crease is a grid line, every
fold is a hinge between two cells, and no fold can collide with a previous one. That removes the
research problem (arbitrary crease-pattern solving) and leaves the engineering problem (mapping an
image to a foldable height field), which is the part that can be finished.

## Pipeline

```
photo
  → segment (foreground mask)
  → normalise (crop, square, N×N resample)
  → height field (luminance + distance transform)
  → fold angles (height delta between adjacent cells)
  → crease pattern (grid lines, mountain/valley)
  → fold plan (ordered operations)
  → renderer (human)  ──►  animation, step text, printable template
  → renderer (machine) ──►  joint trajectories            [January]
```

## Height field

For each cell `(i, j)`:

```
h(i,j) = w1 * luminance(i,j) + w2 * distance_to_edge(i,j)
```

- `luminance` carries the image.
- `distance_to_edge` keeps the silhouette from collapsing to a flat rectangle.
- `w1`, `w2` are tunable; start at 0.7 / 0.3.

Normalise `h` to `[0, 1]` across the grid. Quantise to `K` levels (start `K = 4`) — quantisation
is what makes the fold angles buildable and the pattern legible.

## Fold angles

For a hinge between cells `a` and `b`, the fold angle is proportional to `|h(a) - h(b)|`:

```
theta = theta_max * |h(a) - h(b)| / (K - 1)
```

Direction (mountain/valley) is the sign of `h(a) - h(b)`. `theta_max` is bounded by the paper
(90° is safe; 120° risks tearing).

## Fold plan schema

```json
{
  "version": 1,
  "grid": { "n": 12, "paper_mm": 150 },
  "levels": 4,
  "operations": [
    {
      "id": 1,
      "type": "fold",
      "hinge": [[3, 2], [3, 3]],
      "direction": "mountain",
      "angle_deg": 45,
      "cells": [[0, 0], [3, 3]],
      "depends_on": []
    }
  ]
}
```

`depends_on` is what makes the plan executable in order and reversible in reverse. It is also the
only thing the January robot renderer needs.

## Ordering the folds

Sort by dependency depth, then by distance from the sheet centre. Centre-outwards folds stay
reachable; edge-inwards folds trap the tool. Reversibility is checked by applying operations in
reverse and asserting the sheet returns to flat within tolerance.

## Renderer (human)

- Step diagram: 2D projection of the current sheet state with the active hinge highlighted.
- One sentence per step, imperative: "Fold the top-left corner down along the dashed line."
- Printable template: greyscale, solid = valley, dashed = mountain, plus a legend.
- A "start over" control that resets to step 1 without re-uploading.

## Animation — generated, never authored

The animation is a pure function of the plan:

```
render(plan, step, t) → sheet state
```

No keyframes, no hand-made timelines. A new photograph produces a new animation with no designer
in the loop.

### Model

- **Sheet** — an N×N grid of cells, each with a 3D transform.
- **Operation** — rotate a *cell group* around a *hinge axis* by angle θ.
- **Step** — one or more operations applied together (one flap).
- **Animation** — interpolate θ from 0 to its target over a duration, applied cumulatively.

### Grouping

Operations are grouped into steps by flap: the connected component of cells on one side of the
hinge, bounded by previously folded creases. A step folds exactly one flap. This keeps the step
count human — six to twelve, not one hundred.

### Rendering

- Three.js mesh; each cell is two triangles sharing vertices with its neighbours.
- Hinge axis computed from the two hinge points in sheet space, transformed to world space.
- Fixed isometric camera, optional orbit. The camera never moves during a step.
- Active hinge drawn as a highlighted line; the moving flap gets a slightly warmer tint.

### Controls

- play / pause, scrub, step forward, step back
- speed (0.5×, 1×, 2×)
- "show crease pattern" toggle

### Invariants (testable)

- At the end of the last step, the mesh matches the geometry computed directly from the plan.
- Scrubbing backwards returns to flat within tolerance.
- Step count equals the number of flaps, not the number of creases.
- Frame time under 16 ms at N=16 on a laptop.

### Fallback

If the 3D renderer slips past 20 November, ship a 2D SVG diagram per step instead — a top-down
projection with the moving flap shaded. Less impressive, still followable, and it satisfies R3.

## Failure states

| Condition | Behaviour |
|---|---|
| Mask too large or too small | "I can't find a single object. Try a plainer background." |
| Silhouette nearly rectangular | "This shape is too simple to fold — try something with a distinctive outline." |
| Plan exceeds 40 operations | Reduce N by one step and regenerate, up to twice, then refuse |
| Fold would exceed 120° | Clamp and mark the step "approximate" |

## Testing

- Property-based: any plan round-trips (fold then unfold returns to flat).
- Property-based: operation count is monotonic in N.
- Golden set: 12 photographs across 4 classes, with expected mask quality and plan validity.
- Snapshot: the printable template for one fixture image.

## Deliberate omissions

No AR overlay in v1. No curved creases. No attempt at animal-shaped origami. The product says
"relief" and means it.
