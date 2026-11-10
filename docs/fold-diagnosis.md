# Fold: measured state, 2026-11-08

What is actually known about the two failures reported on 2026-11-08, before any gate is changed.
Every number here was produced by a command in this repository on that date.

The short version: **the pattern closes, the animation does not, and the app refuses a valid subject
over a 0.009-degree numerical residual.** The first is a known limitation. The third is a bug.

---

## 1. The pattern reaches a valid flat-folded state; the path to it is not a rigid motion

Fixture: `fixtures/bush-dog.png`, 150 mm sheet, 54 faces, 108 creases, 53 hinges.

Seam error is the largest distance any corner moves when the rigid panels are welded into a
continuous surface. It is computed by `src/lib/collapse.ts` and reported, never hidden.

| t | seam error |
|---|---|
| 0.00 | 0.0 mm |
| 0.10 | 21.5 mm |
| 0.25 | 39.7 mm |
| 0.53 | **60.0 mm** |
| 0.75 | 42.0 mm |
| 1.00 | **0.0 mm** |

- At `t = 1` the pattern closes exactly and lands on an 87.3 x 44.1 mm footprint. A consistent final
  state means the mountain/valley assignment is globally realizable as a flat state. Whether the
  stacked layers intersect is not checked, so this is necessary, not sufficient, for a valid fold.
- Mid-fold it needs 60 mm of stretch on a 150 mm sheet. Driving all 53 hinges at the same rate is not
  a rigid folding motion. Sequence mode is worse: 97.9 mm at `t = 0.05`.
- `src/lib/collapse.test.ts:141` already records this as a `todo`: *"measured 28-62 mm; welding
  cannot hide it"*. The suite does not fail on it.

**What this proves.** The 3D view is a schematic of the final state, not a proof that the paper can
be folded by hand. The on-screen caption already says it is not a verified folding sequence.

**What this does not prove.** That the paper cannot be folded. A human folds crease by crease, which
is a different path from "all hinges at once", and that path is the one that may work. No paper model
has been folded from a Fold pattern yet.

## 2. The front door refuses a valid subject over a numerical tolerance

Image: `istockphoto-149325740-612x612.jpg` (Belgian Shepherd puppy, standing, plain white
background), 612 x 452. Supplied by the entrant on 2026-11-08. SHA-1
`23e566dd8f40c7f043f781873000a62cb9f4654a`. **Not vendored**: the iStock licence does not permit
redistribution, so the file is not in `fixtures/`. The ladder result below is for this file only;
whether other standing dogs hit the same two vertices is untested.

`runLadder` on that image:

| tier | result |
|---|---|
| Easy | `needs 7 flaps` — not attempted |
| Medium | `needs 7 flaps` — not attempted |
| Hard | solved: 73 vertices, 142 creases, M/V assigned, 70 faces, area 0.8310, valid FOLD, SVG written |
| Expert | solver packs, but no mountain/valley assignment |

Hard then reports `ok = false` because:

```
flatfold  49 interior vertices checked; both pass 47; Kawasaki fail 2; largest residual 1.60e-4 rad at tolerance 5e-5
```

Two vertices are off by **0.0092 degrees**. The gate is set at **0.003 degrees**.

The physical size of the error: on a 50 mm crease it displaces the endpoint by **0.008 mm**. Paper is
0.1-0.3 mm thick. A careful human fold is about 1 degree, or 0.01745 rad — **109x looser** than the
value being refused.

`src/lib/pipeline.ts:963` sets `flatFoldable = false` on any Kawasaki failure, and
`src/lib/pipeline.ts:995` makes `r.ok` depend on it. The SVG and FOLD are still written to disk;
only the verdict is false.

**A second defect.** The command-line pipeline prints `solver ok=true` and writes the SVG, because the
flatfold refusal never prints `REFUSED`. The CLI and the app therefore disagree about the same
result. Anyone testing from the shell sees success while the browser shows "not doable".

**Why the tolerance is suspect.** `src/lib/flatfold.ts:76` uses 5e-5 rad. Its own comment records
that it was raised from 2e-5 because the tuatara missed by 1.1e-5. A third image now needs 1.6e-4.
A threshold raised once per fixture is being fitted, not derived. The residuals are the solver's
optimiser stopping short of exact convergence, not a defect in the pattern.

## 3. What follows

- **Maekawa** (M - V = +/-2) is combinatorial. A failure there is a real defect and should stay fatal.
- **Kawasaki** is numerical. At 0.003 degrees it rejects paper that is foldable in practice. It should
  be reported with a physically motivated threshold, not used as a hard gate.
- A subject that produced a complete, assigned, printable pattern should never be shown as "not
  doable". The pattern and its residual should be shown together, with the number in millimetres.
- The refusal was never the product claim. The claim is "this pattern is 0.008 mm off at two
  vertices, which is smaller than the paper".

**Applied 2026-11-08.** Maekawa stays fatal. Kawasaki is now a warning on the result
(`PipelineResult.warnings`) and does not clear `ok`; the screen shows it above the pattern. The
reported dog now returns `ok = true` at Hard with one warning, and the three fixtures are unchanged
(`tools/check.sh`, 6 checks). The Expert tier still refuses, for the unrelated reason that its
12-leaf tree gets no mountain/valley assignment.

## 4. A ship passes every check and is the wrong subject (2026-11-08)

A synthetic side-view ship (hull, deckhouse, funnel, two masts, crane; 612 x 452, white background)
through `tools/pipeline.ts`:

| | |
|---|---|
| Leaves | 4 (Easy) |
| Solver | `ok=true`, `has_full_cp` |
| Creases | 20 vertices, 37 creases, M/V assigned |
| Flat-fold | 8 interior vertices, 0 Kawasaki, 0 Maekawa |
| Coverage | **0.5597** of the sheet (dog 0.8310, bush dog 0.8440) |

Every check passes. The flat-folded footprint is a 187 x 141 mm wedge and has nothing to do with a
ship. The pipeline models a subject as a tree — a body with limbs radiating from a centre — and a
ship is a long hull with appendages standing on one side. It has the right number of protrusions and
the wrong topology.

**A test was proposed and rejected.** The idea was to measure the largest angular gap between leaf
directions around the body centre and warn when the leaves sit in one half-plane. Measured:

| subject | gap, centroid centre | gap, max-degree centre | coverage |
|---|---|---|---|
| ship | 141 deg | 119 deg | 0.560 |
| dog (user photograph) | 143 | 138 | 0.831 |
| bush dog | 162 | 195 | 0.844 |
| snapping turtle | 130 | 119 | 0.797 |
| tuatara | 102 | 185 | 0.579 |

No threshold separates the ship from the animals. The tuatara, a fixture that folds, is more
one-sided than the ship at one centre and less at the other. Coverage does not separate them either:
the ship (0.560) and the tuatara (0.579) are on the same side of the line. The module was removed
rather than shipped as a check that flags nothing.

**What the app does instead.** The FOLD validator already warns when the faces do not cover the
sheet (`part of the paper has no face`), and the 3D view shows the base before anything is printed.
That is a measurement and a preview, not a verdict. The app cannot tell whether a base resembles its
subject; that is the same question as the paper gate, and it is answered by a person.

## 5. Still unproven, and not fixable in code

1. Whether the Hard pattern for this dog folds by hand at 150 mm.
2. Whether a folded base reads as the subject. A TreeMaker base is a stick-figure base; shaping it
   into an animal is human work, and the README does not claim it.
3. Whether a valid continuous folding sequence exists for these patterns. The `todo` in
   `collapse.test.ts` is the honest statement that we do not have one.

Until (1) is answered, Fold is a research result, not a demonstrated product.

## Reproducing

```
node tools/pipeline.ts fixtures/bush-dog.png
```

The ladder refusal is not reproducible from `tools/pipeline.ts`, because that script never runs the
ladder and never prints `REFUSED` for a flatfold failure. Use the library:

```ts
import { readFileSync } from "node:fs";
import { runLadder } from "./src/lib/ladder.ts";
const r = await runLadder(new Uint8Array(readFileSync("dog.jpg")));
console.log(r.tiers.map((t) => [t.tier, t.attempted, t.ok, t.short]));
```

Seam figures come from `buildCollapse` + `seamProfile` in `src/lib/collapse.ts` at `paperMm = 150`,
sampled over `t` in `[0, 1]`.
