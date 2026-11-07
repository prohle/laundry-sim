# Fold

Fold takes a photograph of a four-legged animal on a plain background, derives a stick-figure tree
of its limbs, and produces an origami crease pattern for one square of paper. It tells you the
smallest complexity tier that can hold the subject before you print, and it refuses when it cannot
produce a pattern with a mountain/valley assignment.

> A photograph becomes a foldable crease pattern, at the complexity you choose.

Category: Frankenstein. Supported class: long-legged four-legged animals on a plain background,
four to twelve flaps, one square, no cuts.

## The chimera

- A camera (2026): the input is a photograph.
- Tree theory (1970s): origami design reduced to packing a stick figure into a square.
- TreeMaker (2006): the research program that does the packing. It is abandoned C++ that does not
  build on a modern system without effort. We use its Rust port, `treemaker-core`.
- A sheet of paper: the output is something you print and fold.

Each piece is from a different decade and none was meant to meet the others. The photograph
becomes the paper, and the output leaves the screen.

## What it does

1. You upload one PNG or JPEG (up to 10 MiB).
2. The photograph is thresholded to a silhouette and thinned to a skeleton. Short, thick branches
   are pruned by a significance measure (branch length over local radius, threshold 2.0). The
   result is a tree of flaps drawn over your photograph.
3. The minimum tier is computed from the number of significant flaps and shown with the reason:
   Easy 4, Medium 6, Hard 8, Expert 12 flaps. Below the minimum, the tier is not offered.
4. The tree is passed to the TreeMaker port, which packs it into the square and builds the crease
   pattern. The mountain/valley assignment is computed by the solver, not by us.
5. The pattern is returned as a printable SVG at a stated paper size, with a legend.

If the solver does not produce a full mountain/valley assignment, no pattern is shown. The
beetle fixture is that case.

## What is measured

All figures below are from runs in this repository. Conditions are stated.

- Solver parity: scale matches the C++ TreeMaker reference output on 3 of 3 example models, with
  differences of 0.000000 at six decimals (0.517637, 0.074658, 0.056381). Enforced by
  `solver/tests/parity.rs`. Crease patterns build on four of the five shipped example models; the
  fifth fails with `polygon inset distance was not found`, and the test asserts that failure.
  A vertex-and-edge diff of a crease pattern against a published one has not been done: the
  reference output contains no vertex or edge data.
- Dog fixture (`fixtures/bush-dog.png`, a cut-out; see Limits): 1564x1006, analysed at 512x329.
  18 leaves before pruning, 6 after (4 feet, tail, head). Minimum tier Medium. Solver converged,
  scale 0.734019, `has_full_cp`. 55 vertices, 108 creases: 27 mountain, 39 valley, 22 flat,
  20 border.
- Local flat-foldability on the dog: 35 interior vertices, 0 Maekawa failures, 0 Kawasaki failures
  at a tolerance of 2e-5 rad; the largest residual is 1.08e-5 rad. At 1e-6 rad, 11 vertices fail
  Kawasaki. We read this as the optimiser stopping short of exact convergence. These checks are
  necessary, not sufficient: global foldability and the folded-state count are not computed.
- End to end, dog: 0.51 s in one run on the development machine (decode 48 ms, skeleton 385 ms,
  solver 45 ms). The requirement is 20 s.
- Tests: 52 Node tests and 10 Rust tests pass (`npm test`, `cargo test --release` in `solver`).

## Limits

- Supported class: long-legged four-legged animals on a plain background. Only one fixture, the
  dog, produces a tree we accept. Two other animals fail: the snapping turtle gives 3 leaves where
  6 are needed, and the tuatara gives 12 where 6 are needed.
- The significance measure fails on stubby legs (a large body with short legs scores each leg too
  low) and on split toes (each toe scores high). No single threshold fits both. The default of 2.0
  was calibrated on the dog.
- A curled limb is measured by its chord, not its path. The tuatara tail is 27% short.
- The beetle is refused: the tree has 8 leaves, which the tier rule calls Hard, and the solver
  returns a pattern with no mountain/valley assignment. The design says a beetle needs ten flaps;
  the antennae are lost at the mask, so the minimum tier shown for it is too low.
- The pattern covers the packing polygon, not the whole sheet. On the dog the faces cover 0.8438
  of the unit square.
- The simulation does not fold our patterns. In Origami Simulator the dog pattern loads and
  collapses to a thin wedge with faces passing through each other. We tried fold angles and a
  swapped mountain/valley mapping; neither helped. TreeMaker's own full-square example (model 5,
  faces covering 0.999999 of the sheet) fails the same way. We could not determine whether the
  fault is in our FOLD export or in how we drive the simulator. No paper model has been folded
  from a Fold pattern yet, so we do not claim one reads as the animal.
- No cuts. A cut would break the single-square assumption the packing relies on.
- Four to twelve flaps. Anything outside is refused.
- The photograph is uploaded to a server, processed in memory and discarded. It does not stay on
  the device.
- The printed sheet has a legend and paper size. It does not yet state a step count or time
  estimate, and the tier step and time figures in the spec are estimates not yet measured.

## How to run

Needs Node 24 (the scripts run `.ts` directly) and a Rust toolchain.

```
npm install
cd solver && cargo build --release && cd ..
npm run dev
```

The app finds the solver at `solver/target/release/fold-solver`, or at `FOLD_SOLVER` if set.
Open http://localhost:3000. To run one fixture from the command line:
`node tools/pipeline.ts fixtures/bush-dog.png`.

Docker:

```
docker build -t fold .
docker run --rm -p 3000:3000 fold
```

The image builds the solver with cargo, builds the app, and runs the standalone Next server. No public URL is deployed yet.

## Prior work

No pre-existing application code. Built during the submission period. This repository's history
contains two earlier attempts from the same period (a relief generator and a slicing generator);
both were retired before the origami pipeline was written and their code was deleted.

- Dependencies: Next.js, React, `jpeg-js`, `pngjs`, TypeScript; Rust crate `treemaker-core` 0.1.0.
- TreeMaker by Robert J. Lang is GPL. We use its Rust port `treemaker-core`
  (GPL-2.0-or-later) in `solver/` (`fold-solver`, also GPL-2.0-or-later). The five `.tmd5`
  example models and the reference output in `solver/fixtures/` are from the TreeMaker 5 source;
  provenance is in `solver/fixtures/README.md`.
- Origami Simulator (MIT, Amanda Ghassaei) was used as an external check on the hosted site. It is
  not shipped or vendored.
- TreeFaker was evaluated and removed; it has no licence.
- Fixtures are in `fixtures/`. The beetle and bush dog are CC0; the snapping turtle is
  public domain (Flickr Public Domain Mark); the tuatara is public domain (uploader's
  declaration). The bush dog and tuatara are cut-outs, and the bush dog is tagged as AI-modified
  on Commons. Sources, authors and hashes are in `fixtures/README.md`.

How Kiro was used is in `docs/kiro-usage.md`.

## Licence

AGPL-3.0. See `LICENSE`.
