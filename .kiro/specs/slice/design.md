# Stratum — design

## What this is not

Not a general 3D scanner. Not single-photo reconstruction. Not a fold-plan generator. The medium
is a stack of flat sheets, and the product says so on screen.

## The thesis

> **Four photographs become a cut file.**
> The model is the asset: a human cuts it, a laser cuts it, a CNC cuts it. Same plan, many
> executors.

The executor axis survives the pivot intact. What changes is the medium: paper folding was the
cheapest executor, but it could not produce an object you can walk around. A stack of flat layers
can.

## The research question

Silhouette carving is the cheapest way to get 3D from phone photos, and it is convex on every
horizontal slice — holes and undercuts are erased before you see them. Fabrication adds a second
deformation: layers must be planar, connected, carry a registration feature, and clear the
cutter's minimum feature width. The two losses compound, and nobody has measured the compound for
a four-photo, laser-cut pipeline.

So the contribution is a measurement, in three configurations:

| Configuration | What it adds | What it costs |
|---|---|---|
| **A** silhouette | the visual hull | concavities |
| **B** + photo consistency | voxel colouring | specular and transparent surfaces |
| **C** + fabrication | min-width, bridges, registration | small features, thin necks |

Reported as silhouette IoU per input view, and as IoU against view count (one, two, four). The
table is the paper; the object on the desk is the demo.

## Capture protocol

Four photographs, 90° apart, object and light fixed, camera moving. Rotating the object instead
would rotate the lighting with it and break photo consistency.

- Object upright on a plain background.
- Camera at the object's mid-height, pointing horizontally.
- Distance at least four times the object's width, so perspective error stays under ~5%.
- Four positions marked on the floor or desk: front, right, back, left.

The app shows these instructions before the first photo and refuses to reconstruct if the views
disagree.

## Pipeline

```
4 photos
  → segment (4 silhouettes)
  → align (common vertical axis, common scale, from bounding boxes)
  → carve (silhouette, then photo consistency)
  → slice (horizontal bands at material thickness)
  → fabricate (min-width, bridges, registration)
  → slice plan (JSON, versioned)  ──►  SVG per layer, layout sheet
                                   ──►  3D preview, layer stepping
  → measure (reproject, IoU per view)
```

## Geometry and conventions

World axes: **X** right, **Y** up, **Z** toward the viewer. The object stands on the XZ plane and
stacks along **Y**.

A view at angle θ projects a point (x, y, z) to

```
u =  x·cos θ + z·sin θ
v =  y
```

Orthographic. For a fixed height y, each view's silhouette gives the set of u that is occupied.
A voxel is kept only if every view's projection lands inside that view's silhouette.

Because each view contributes a slab in the XZ plane, the per-slice hull is an intersection of
slabs, hence **convex**. That is the honest limit of silhouette carving, and it is stated in the
interface, not buried.

## Reconstruction

**Silhouette carving.** Rasterise the grid at a configurable voxel size (default 2 mm). Mark a
voxel occupied if all four projections are inside. One pass, no iteration.

**Photo consistency.** For each surviving voxel, project its centre into each view, sample the
colour, and discard the voxel if the spread across views exceeds a threshold, or if any sample
lands on background. This is standard voxel colouring and it is what recovers a mug's handle
gap, a bottle's neck shadow, a toy's wheel arch.

Assumptions to state: diffuse surfaces, fixed lighting, no strong speculars. A shiny object
degrades gracefully — the app reports the fraction of voxels that failed consistency and falls
back to A.

## Slicing and fabrication

Layer `k` covers `y ∈ [k·t, (k+1)·t]` for material thickness `t`. The layer polygon is the union
of occupied voxels in the band, projected onto XZ, extracted as contours and simplified.

Constraints applied during, not after, reconstruction:

1. **Minimum feature width** — morphological opening at `min_feature / 2`. Report how many layers
   lost area or components.
2. **Connectivity** — if a layer has more than one component, bridge each island to the nearest
   component with a rectangular connector at least `min_feature` wide. Count the bridges; they
   are material the object does not have.
3. **Registration** — a circular hole on the shared vertical axis, at the footprint centroid. If
   a layer does not cover the axis, bridge to it. The rod is the assembly jig.

Kerf is compensated by offsetting the exported contour outward by `kerf / 2`.

## Slice plan schema

```json
{
  "version": 1,
  "capture": { "views": 4, "protocol": "upright-90deg-orthographic" },
  "model": { "voxel_mm": 2, "bbox_mm": [82, 140, 61] },
  "material": { "thickness_mm": 3, "kerf_mm": 0.15, "min_feature_mm": 1.2 },
  "registration": { "axis": [41, 30], "hole_mm": 5 },
  "layers": [
    {
      "index": 0,
      "y_mm": 0,
      "contours": [[[0, 0], [12, 0], [12, 9], [0, 9]]],
      "holes": [],
      "bridges": [],
      "islands_joined": 0
    }
  ],
  "fidelity": { "front": 0.94, "right": 0.91, "back": 0.93, "left": 0.92 },
  "diagnostics": { "voxels": 41822, "consistent_fraction": 0.87, "opened_layers": 2 }
}
```

`layers` is the intermediate representation. The SVG is a renderer of it. A January CNC or robot
renderer consumes the same file.

## Presentation

- **Preview** — orbitable mesh of the reconstructed model, with the four camera directions marked.
- **Stack** — layer stepping: show the assembly building up, one layer at a time.
- **Export** — per-layer SVGs, a combined layout sheet, and the slice plan.
- **Numbers** — IoU per view, voxel count, consistent fraction, layer count. The measurement is
  part of the interface, not an appendix.

## Failure states

| Condition | Behaviour |
|---|---|
| A view is missing | Name the view. Do not reconstruct. |
| Silhouette > 90% or < 2% of frame | "I can't find a single object. Try a plainer background." |
| View heights disagree by > 15% | "These four photos aren't the same object at the same scale." |
| Grid empty after carving | "The silhouettes disagree. Reshoot with the object upright and centred." |
| > 40% of voxels fail photo consistency | Warn: shiny or transparent; fall back to silhouettes. |
| More than 60 layers | Warn about material and time; offer a coarser thickness. |

## Testing

- **Property** — carving is monotone: adding a view never increases the voxel count.
- **Property** — the slice plan round-trips through JSON without loss.
- **Property** — every layer in the plan is connected after bridging.
- **Golden** — three fixtures (bottle, mug, toy car) with expected IoU inside a tolerance.
- **Snapshot** — the SVG for one layer of one fixture.
- **Determinism** — the same four photos produce byte-identical plans.

## Deliberate omissions

No learned 3D prior. No single-photo mode. No curved layers. No internal voids. No colour or
texture on the output. No claim of general reconstruction.

## Risks and the cut line

| Risk | Mitigation | Cut line |
|---|---|---|
| Photo consistency does not beat silhouettes | Measure early on the fixtures | **20 Nov** — ship A, keep the measurement |
| No laser cutter available | Hand-cut card from printed templates, 8 layers | 21 Nov |
| Assembly takes too long | 3 mm ply, 10 layers, glued on a rod | 24 Nov |
| Capture quality varies | Alignment screen with nudge, refusal states | built in |
| Scope outruns the demo | The fun path ships first; research rides on top | 20 Nov |
