# Fold — tasks

Ordered. Each task leaves the repo runnable. Gates are kill criteria, not reminders.

## Phase 0 — Commit the pivot (6 Nov)

- [x] 0.1 Spec rewritten for origami; category locked as Frankenstein
- [ ] 0.2 Retire the relief and slice generators to `_local/retired/`
- [ ] 0.3 Commit with the reason in the message

## Phase 1 — Solver parity (7–10 Nov)

- [x] 1.1 Evaluate TreeFaker: does it solve a known tree and emit a crease pattern?
- [ ] 1.2 Fallback: build TreeMaker 5 from source with `g++` and `make`
- [ ] 1.3 Pick three reference models with published crease patterns (crane, one `.tmd5`
      example, one four-legged animal)
- [ ] 1.4 Reproduce each; diff vertices and edges against the reference
      - **Scale parity: 3 of 3, exact.** Against the C++ reference's recorded ALM output
        (`solver/fixtures/tmModelTester.out.txt`): 0.517637, 0.074658, 0.056381. Measured
        differences are 0.000000 at six decimals. `solver/tests/parity.rs` enforces this.
      - Crease pattern built on models 1, 3, 4 and 5. Model 2 fails with
        `invalid operation: polygon inset distance was not found`, and the test asserts that
        exact failure so a regression is visible.
      - **Not done:** a vertex-and-edge diff of the crease pattern. The reference output
        contains no vertex or edge data, so this cannot be checked against it. Needs a
        published crease pattern instead — that is 1.3.
- [x] 1.5 Write down the parity result, pass or fail, with the numbers
      - TreeFaker's engine runs headlessly when bundled with esbuild.
      - The fiveStar and bone trees each solve in about 150 ms and export FOLD.
      - The crab tree from tests/helper (a Jason Ku four-legged design) fails with `twisted`
        after 6 attempts.
      - Every crease comes back with assignment `Unknown`: mountain/valley is not computed.
- [ ] 1.6 Investigate the crab tree failure (`twisted` after 6 attempts): cause and whether it
      is fixable or needs the TreeMaker 5 fallback (1.2)
- [x] 1.7 Remove the unlicensed vendoring (TreeFaker has no licence) — done
- [x] 1.8 Evaluate treemaker-core as the licensed solver
      - treemaker-core 0.1.0, GPL-2.0-or-later, cargo 1.99.1.
      - Five TreeMaker 5 example `.tmd5` models: all converged and feasible; four built a crease
        pattern; one failed with `invalid operation: polygon inset distance was not found`.
      - 0 to 7 ms per model.
      - No programmatic tree constructor; input is `.tmd5` text only.
- [x] 1.9 Tree-to-`.tmd5` serialiser: write a Fold tree as TreeMaker's `.tmd5` text so
      `Tree::from_tmd_str` can read it
      - `./solver` (`fold-solver`, GPL-2.0-or-later) reads a tree as JSON and emits v4 text,
        which is re-parsed as canonical v5 before the optimiser runs.
      - Bug found and fixed: the optimiser starts from the node coordinates, so they must lie
        inside the paper. Coordinates are now normalised into [0.1, 0.9]; edge lengths are
        unchanged. Without this, every tree outside the unit square failed with
        `ALM returned result code 1`.
      - Measured after the fix: chains of 3–10 nodes and stars of 3–10 nodes all converge, and
        an 8-node four-legged animal converges at scale 0.1496. A chain of *n* unit edges gives
        exactly 1/(n−1).
      - Still open: no crease pattern has been diffed against a published reference (1.4).

**Gate, 10 Nov:** parity on at least two of three. Fail → box-pleating only, and the claim narrows
to "box-pleated animals".

## Phase 2 — Tree, pattern, assignment (10–15 Nov)

- [ ] 2.1 Tree type: nodes, edges, lengths, strain; JSON round-trip
- [ ] 2.2 Flap budget per tier; monotonicity property test
- [~] 2.3 Crease pattern from the solver, as FOLD
      - Spec change, 2026-11-06 (user request): `fold-solver` now emits `cp` as JSON
        (`vertices` in [0,1], `creases` with 0-based endpoints and `fold`), plus `cp_status`,
        `cp_built`, `facet_colors`. Not FOLD format yet. Fold codes read from treemaker-core
        source: 0 flat (F), 1 mountain (M), 2 valley (V), 3 border (B).
      - `ok` does not imply a pattern: the crate returns Ok from `build_polys_and_crease_pattern`
        with zero vertices (seen: 8-node tree with Euclidean edge lengths) or with status
        `edges_too_short` (beetle, one edge of 0.009 against a 0.01 minimum). Use `cp_built`.
      - M/V is computed by the crate only when `cp_status` is `has_full_cp` (models 1 and 5, and
        the dog). Otherwise every crease stays `F`.
      - Spec change, 2026-11-06 (user request): FOLD 1.1 export, `tools/fold.ts`, written by the
        pipeline to `tools/out/<name>.fold.json`, with a structural validator. `fold-solver` also
        emits `cp.faces` (0-based, from `Facet.vertices`, only for well-formed facets).
      - Done: `Facet.vertices` is well formed on both subjects (counter-clockwise, 54 and 75 faces),
        so `faces_vertices` is written. It is omitted, with the reason, if any facet is not.
        Validator checks edge and face indices, vertices in [0,1], assignment length, face winding.
      - **Open finding:** faces cover 0.84 of the unit square on both subjects. The `B` creases are
        not the paper edge: none has both ends on the square. The pattern is the packed polygon,
        not a full sheet, so a simulator would fold a smaller shape than the paper. Not investigated.
      - `tools/cp-to-svg.ts` renders it (a slice of 5.4, no step count or time yet); an all-F
        pattern is stamped "Mountain/valley not computed. Do not fold from this sheet."
- [ ] 2.4 Kawasaki and Maekawa checks at every interior vertex
- [ ] 2.5 Flat-folded state enumeration; report the count
- [ ] 2.6 Mountain/valley assignment where the count is one; collapse direction otherwise

**Gate, 15 Nov:** one pattern passes local flat-foldability and prints with a legend.

## Phase 3 — Photo to tree (15–20 Nov)

- [x] 3.1 Silhouette → medial axis / skeleton
      - `src/lib/skeleton.ts`: Zhang-Suen thinning, graph extraction, spur pruning, flap-budget
        reduction. Dependency-free, deterministic. 7 tests pass under `npm test`.
      - Verified against realistic silhouettes: 4 distinct legs → 6 leaves; 3 legs (one hidden)
        → 5; 4 legs with a 2 px gap → 6; 4 legs touching → 5; 2 legs → 4; disc with a
        protruding bar → 2; mug with a handle (a hole) → 3, no throw.
      - Known limit: a spike of 2 px or more leaves a spur of roughly spike + half the limb
        width, so the default 5% threshold does not prune it. The caller must raise
        `spurThreshold` for wide limbs.
      - Performance: 18 ms at 180×140; 2.2 s at 1024×1024. Inside N1 but it needs watching.
- [x] 3.2 Skeleton → tree with limb lengths, normalised to the square
      - Coordinates normalised to [0,1] on the longer axis, aspect preserved. A `frame`
        field maps back to pixels so the tree can be drawn over the photo (R2.2).
- [~] 3.6 End-to-end script `tools/pipeline.ts`: image -> mask -> `extractTree` -> `./solver`
      (spec change, added 2026-11-06: no task covered running 3.1, 3.2 and 1.9 together on a real image)
      - First real image: CC0 photograph of a beetle (`fixtures/README.md`). Runs end to end in
        about 0.5 s; solver converged, feasible, crease pattern built.
      - It exposed a bug in 3.1: at a "fat" junction `buildGraph` split the skeleton into three
        graphs and `makeTree` kept the left half, so the hind leg was lost. Fixed, with a
        regression test (`src/lib/skeleton.photo.test.ts`) that fails without the fix.
      - **Not done:** the tree is not yet one a human would accept. With the default spur
        threshold the beetle gives 23 leaves (12 after the flap budget), several on the
        wing-case edge with no limb under them, and the antennae are lost by the threshold mask.
        One image only. Passing the 20 Nov gate needs three subjects.
      - Significance pruning (spec change, 2026-11-06, refines 3.1): leaf branches with
        length / radius below a threshold are pruned, radius from a Borgefors 5-7-11 chamfer
        distance transform; it runs before the pixel `spurThreshold`, which is now off by default.
        Second subject added: `fixtures/bush-dog.png` (CC0, but background edited and tagged
        AI-modified on Commons; see `fixtures/README.md`).
      - **Result: the specified default of 1.0 does not separate spurs from limbs.** It drops only
        1-7 px stubs (4 of 37 leaves on the beetle, 4 of 18 on the dog). A bump on a body edge
        scores about 1 + h/R, because the branch from the body axis to the outline is already one
        radius long. Dog: spurs on the back and rump scored 1.13-1.48, the head 1.03-1.19, legs
        and tail 3.6-5.4. Sweep (leaves after significance, beetle / dog): 1.0: 33 / 14;
        1.5: 15 / 7; 2.0: 8 / 6; 2.5: 5 / 6; 3.0: 5 / 5. The dog reaches the expected 6 flaps
        (4 feet, tail, head) on a plateau from 1.75 to 2.5; the beetle has no plateau. Two
        subjects, one of them edited: not enough to set a default. Left at 1.0 as specified.
      - Spec change, 2026-11-06 (user decision): default significance threshold is now **2.0**,
        calibrated on one clean fixture (the dog); the beetle has no plateau, so it is a starting
        point, not a universal value. The flap budget (`maxLeaves`) now drops the lowest-significance
        leaf first, ties by shorter pixel length, instead of the shortest by pixels. At 2.0 / budget 12:
        beetle 37 -> 8 -> 8 leaves, dog 18 -> 6 -> 6; both solve and build a crease pattern.
- [~] 3.7 Contract sub-minimum edges before the solver (`src/lib/contract.ts`)
      (spec change, added 2026-11-06, user request: the beetle fails with `edges_too_short`)
      - Edges shorter than a threshold (default 0.012, crate minimum 0.01) are contracted; a leaf
        edge below the threshold drops that leaf, and the drop is reported, never silent.
      - Done: 8 tests pass (a 0.009 edge reproduces `edges_too_short`, contracts, then solves).
        Beetle: `edges_too_short` -> `polys_multiple_ibps`. A pattern of 73 vertices and 147 creases
        is built, but every crease is `F`: no mountain/valley, so the pipeline refuses to call it
        printable. Dog: no short edge, `has_full_cp` before and after.

- [x] 3.3 Minimum-tier computation from the tree
      - `src/lib/tiers.ts`: `rankLeaves`, `treeForTier`, `minimumTier`, `tierReport`. Budgets 4/6/8/12.
        `extractTree` now returns `leafSignificance` (the existing length/radius measure), which
        tiers.ts reads. 12 new tests pass; tiers are nested because every tier takes the top-k of one ranking.
      - `minimumTier` must be given the tree *without* a flap budget, or it can never exceed 12.
      - Pipeline: dog 6 leaves -> Medium (correct). Beetle 8 leaves -> Hard, which is wrong: the design
        says a beetle needs ten. Cause: the 2.0 threshold was calibrated on the dog, and the antennae are
        lost at the mask. The minimum tier is only as good as the leaf count under it.
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
      - Spec change, 2026-11-06 (user request): a check run before the renderer exists. Hosted
        Origami Simulator (MIT, Amanda Ghassaei) driven headlessly; `tools/out/bush-dog.fold.json`
        loaded after a copy renamed `.fold` (the app rejects `.json`) with "use current angles"
        unticked. Screenshots `tools/out/sim-1-start.png`, `sim-2-partway.png`, `sim-3-end.png`.
        Result: loads; 0% is a flat lopsided polygon; 100% is a thin wedge with faces passing
        through each other, still moving after 15 s. It does not read as an animal. Not a pass.
      - Kawasaki default tolerance is now 2e-5 rad (`src/lib/flatfold.ts`); the largest residual is
        still reported.
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
