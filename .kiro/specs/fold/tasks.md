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
- [x] 2.7 Property-based tests, and the three defects they found
      - fast-check, 2,406 cases across nine properties, run inside `npm test` (61 tests total).
      - Defect 1: a tree with subnormal coordinates (~5e-323) makes `treemaker-core`'s
        `from_tmd_str` hang for over 300 s. The serialiser now rejects non-finite coordinates,
        values below 1e-9 or above 1e6, and node pairs closer than 1e-9.
      - Defect 2: the solver spawn had no timeout, so a pathological tree hung the request. It
        now times out at 10 s and returns a refusal.
      - Defect 3: splicing used the chord, which collapsed two coincident nodes to a zero-length
        edge. Splicing now sums the two edge lengths (path length), which is the paper a flap
        consumes and also corrects the 27% underestimate on a curled limb.
      - The dog is unchanged by all three: scale 0.734019, 6 leaves, 35/35 interior vertices
        flat-foldable. Straight limbs lose nothing from the chord-to-path change.

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
- [x] 3.8 `src/lib/pipeline.ts`: the whole pipeline as one function, bytes in, geometry out
      (spec change, added 2026-11-06, user decision: server-side architecture, see N3)
      - No file writes and no console output inside the module. `tools/pipeline.ts` becomes a thin
        wrapper (reads the file, prints the log, writes the debug files); its output is unchanged.
      - Done. Dog and beetle run before and after: same exit codes (0, 1), same stdout apart from
        the timing line and Node's PID in its module warning, and all 12 debug files byte-identical.
        The solver now runs through async `spawn`, so the server is not blocked. `npm test`: 52 pass.
- [x] 3.9 `src/app/api/fold/route.ts`: `POST /api/fold`
      (spec change, added 2026-11-06, user decision)
      - 415 unsupported type, 413 too large, 200 with `ok:false` for a refusal, 500 for a fault.
        `FOLD_SOLVER` names the solver binary. Smoke test on `fixtures/bush-dog.png` and a text file.
      - Input is the raw image as the body with Content-Type image/png or image/jpeg, capped at
        10 MiB; type is also checked by magic bytes. A pattern is returned only when `ok` is true.
      - Smoke test `tools/smoke-fold-api.ts` against `next dev`: dog 200 ok:true (medium, 55
        vertices, 108 creases); text/plain 415; text typed as png 415; 11 MiB typed as png 413;
        beetle 200 ok:false (stage `assignment`, pattern null); `FOLD_SOLVER` unset-to-bad 500.
        Not tested: `next build` / `next start`, a corrupt-but-valid-magic image, concurrent requests.

- [~] 3.10 Automatic significance threshold (`src/lib/select.ts`, `tools/sweep.ts`)
      (spec change, added 2026-11-06, user request: replaces the hand-set 2.0 of 3.6)
      - Score: the tree redrawn as capsules of radius = distance-transform value at each edge's
        midpoint; IoU against the mask. Sweep 1.0..4.0 by 0.25 (13 trees); value = IoU - lambda * leaves;
        best value wins, ties to fewer leaves then the higher threshold. `runPipeline` does this when
        `significance` is not given; an explicit value still overrides. `lambda` = 0.03.
      - Lambda came from the same four fixtures it is judged on (no held-out subject). Window in which
        dog = 6, turtle >= 6 and tuatara <= 6 all hold: 0.0217 to 0.037. Outside it the dog goes to 14
        leaves below 0.0156 and to 5 leaves above 0.049; the turtle collapses to 2 leaves above 0.037.
      - Cost: about 1.5-2.7 s per image for the sweep, on top of the rest. N1 holds (2.0-3.7 s total).
      - Beetle: now refused at stage `tier` (15 leaves) instead of `assignment`; the true count is
        about ten, so 15 is an overcount. Tuatara: 6 leaves, solved, but 4 of 34 interior vertices fail
        Kawasaki at a residual of 3.1e-5 rad against the 2e-5 tolerance, so `ok` is false.

- [x] 3.3 Minimum-tier computation from the tree
      - `src/lib/tiers.ts`: `rankLeaves`, `treeForTier`, `minimumTier`, `tierReport`. Budgets 4/6/8/12.
        `extractTree` now returns `leafSignificance` (the existing length/radius measure), which
        tiers.ts reads. 12 new tests pass; tiers are nested because every tier takes the top-k of one ranking.
      - `minimumTier` must be given the tree *without* a flap budget, or it can never exceed 12.
      - Pipeline: dog 6 leaves -> Medium (correct). Beetle 8 leaves -> Hard, which is wrong: the design
        says a beetle needs ten. Cause: the 2.0 threshold was calibrated on the dog, and the antennae are
        lost at the mask. The minimum tier is only as good as the leaf count under it.
- [~] 3.4 Human-in-the-loop correction: drag, lengthen, delete
      - `/api/fold` also takes multipart/form-data (`image` + `tree` JSON); `src/lib/tree-validate.ts`
        gives 400 for non-tree, cycle, gap, coordinates outside [0,1], non-positive length. Pure edits in
        `src/lib/tree-edit.ts`; handles, live flap count and tier, "Fold this" in `src/app/page.tsx`.
        Added leaves attach to the nearest point on the skeleton (a link is split), not the nearest node.
      - Turtle (`fixtures/snapping-turtle.jpg`): 3 leaves, Easy, 18 creases, M/V assigned -> after three
        hand-added leaves 6 leaves, Medium, converged, 89 creases, M/V assigned (V 29, M 20). A first
        attempt with one leaf placed 0.004 from the skeleton lost that leaf to contraction (0.012).
      - Not done: lengthen an edge by itself (length follows the drag), mask-aware add (any click on the
        photo adds), keyboard/touch not exercised by script, no test of the UI beyond one scripted run.
        Whether the turtle pattern reads as a turtle is unknown (4.x).
- [~] 3.5 Refusal states: no limbs, too many limbs, packing fails
      - Spec change, 2026-11-06 (user request, from a real listing screenshot that reached the solver
        as a rectangle and was refused with `polys_not_valid`): `assessMask` in `src/lib/pipeline.ts`
        reports coverage, components (largest first), largest share and rectangularity, taken before
        the largest component is kept. New refusals, plain message, numbers in `detail`: two or more
        components each >= 15% of the largest (stage `mask`); rectangularity > 0.92 (stage `mask`);
        fewer than 3 leaves in the tree handed to the solver (stage `tree`). The existing 2%/90%
        coverage refusal is unchanged. `src/lib/refusals.test.ts`, 11 tests, in `npm test` (95 pass).
      - Measured rectangularity: dog 0.507, turtle 0.616, tuatara 0.370, beetle 0.405. Thresholds are
        the specified ones, not calibrated; four subjects, none near 0.92. Rectangularity uses the
        axis-aligned box, so a rotated rectangle scores lower and is not caught.
      - Not done: the user's screenshot was not in the workspace and was not run. Packing-fails
        refusal and a flap-count (too many) refusal on the mask side are separate, still open.

- [~] 3.11 Find the foldable objects in an image instead of refusing when there are several
      (spec change, added 2026-11-06, user request: a listing screenshot with two green products,
      dimension arrows and text; the primary mask took the right-hand photograph, whose background is a
      wooden table, as one solid rectangle)
      - `src/lib/segment.ts`: candidate segmentation. The existing mask stays the primary path. A colour
        fallback (k-means, k = 6, in RGB) runs only when the primary yields no candidate that reaches a
        tree, or its largest component is near-rectangular. Candidates: components of at least 2% of the
        frame, cap 6, largest first. Each is analysed by the existing pipeline; the best becomes the
        top-level result, the rest are listed in `candidates`. `significance` and `lambda` defaults unchanged.
      - The user's image is not in the repo and not in fixtures.
      - Done: `analyseImage` (`src/lib/segment.ts`), `tools/candidates.ts` (reports, writes nothing),
        `/api/fold` returns `candidates` and `segmentation`; top-level fields describe the best candidate.
        `npm test`: 100 pass. Not exercised: the UI (it still shows only the top-level result), `next build`.
      - Fallback seeding: luminance-quantile centres, 30 Lloyd iterations, no random numbers.
      - **squid.png (1655x1051, two aquarium ornaments, dimension arrows, captions):** the primary mask
        already finds both (white page = border colour); it was the *largest-component-only* step that lost
        the left one. Candidates: left 10.6% of frame, 4 leaves, Easy, ok, pattern built; right 16.4%, the
        photograph on a wooden table, a solid rectangle (0.942), refused at `mask`. The rectangularity rule
        triggered the colour fallback anyway. **Colour segmentation does not isolate the objects:** k=6
        clusters are white 67.9% (all of the border) and five grey-green shades (26,27,26 7.6%; 68,76,74 9.3%;
        112,127,124 6.6%; 167,158,148 5.5%; 199,205,204 3.1%). The green ornaments and the wood/dark wall of
        the second photo are spread across those, so the fallback's 3 candidates are fragments (11, 12, 12
        leaves from texture): one built a pattern but failed Kawasaki at 22 of 134 vertices, two refused at
        `tier`. The primary result was kept. The 4-leaf Easy result is a moai-shaped block, not a limbed
        animal: that it folds does not mean it reads as the object.
      - Fixtures: dog, turtle, tuatara each 1 candidate, primary path, fallback not run, ok (6 leaves, Medium).
        Beetle: 1 candidate, 12 leaves after budget, refused at `tier` (15 flaps), as before.
      - Two copies of the dog on one sheet: 2 candidates found, both reach the solver; one fails flatfold
        because each is at half resolution after the sheet is downscaled to 512 px.
      - Cost: up to six candidates at ~2-3 s each; the squid took 1.2 s because
        most were refused early. N1 (20 s) is not checked for a six-candidate image.

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
      - Spec change, 2026-11-06 (user hypothesis): the first run crumpled because the FOLD had no
        `edges_foldAngle`. `tools/fold.ts` now writes it (M 180, V -180, F/B 0), a direct function of
        the assignment, with a validator check (length equals edge count, values in {180, -180, 0}).
        Dog: 27 M, 39 V, 22 F, 20 B. Re-run, screenshots `tools/out/sim2-*.png`: **hypothesis not
        confirmed as sufficient.** Loaded with no dialog (the "use current angles" box is ticked by
        default and the dialog only appears for files without angles). 50%: a crumpled star of
        flat faces, no limbs. 100%: a flat sliver, faces crossing, strain everywhere, never settled.
        Stopped there; no per-crease tuning. The open finding above (faces cover 0.84 of the
        sheet, so the mesh is not a full square) is the next suspect and is not investigated.
      - Spec change, 2026-11-06 (user hypothesis): M/V mapping inverted? **Not the cause.** treemaker-core
        `FOLD_FLAT/MOUNTAIN/VALLEY/BORDER = 0/1/2/3` (lib.rs:54-57) and the C++ reference
        `tmCrease.h` `enum Fold { FLAT=0, MOUNTAIN=1, VALLEY=2, BORDER=3 }` agree with
        `solver/src/main.rs` (0 F, 1 M, 2 V, 3 B). Swapped copy `tools/out/bush-dog.swapped.fold`
        (M<->V, +180<->-180) run beside the normal one, same settings: `swap-normal.png`,
        `swap-swapped.png`. Both end as a thin, faceted wedge with faces crossing and strain
        everywhere, still moving after 20 s; neither shows limbs. Stopped; no per-crease tuning.
      - Spec change, 2026-11-06 (user request): control experiment. `fold-solver --tmd5 <file>`
        runs optimise, build and export on a `.tmd5` directly (test added). Model 5 ->
        `tools/out/model5.fold.json`, same simulator setup, `tools/out/model5-{0pct,50pct,100pct}.png`.
        Model 5 as exported: `has_full_cp`, 217 vertices, 434 creases (B 62, F 122, M 99, V 151),
        218 faces covering 0.999999 of the sheet. Result: loads; at 100% a thin
        wedge with 6891 piercing face pairs (326 of 370 triangles), no limbs. Model 5 does not fold
        into a base either, so the fault is in our export or in how the simulator is driven, not in
        the dog's coverage. Nothing tuned. Physical fold on hold until this is understood.
      - Kawasaki default tolerance is now 2e-5 rad (`src/lib/flatfold.ts`); the largest residual is
        still reported.
- [~] 5.0 Product screen `src/app/page.tsx`: empty, processing, result, refusal (and a fault state)
      - Spec change, 2026-11-06 (user request): replaces the relief UI. Deleted `Relief3D.tsx`,
        `src/lib/crease.ts`, `src/lib/db.ts`, `src/app/api/plans/route.ts`; removed dependencies
        `@imgly/background-removal`, `three`, `@types/three` and the `next.config.ts` alias that existed for imgly.
        `/api/fold` now also returns `pattern.svg` (already built by the pipeline, previously dropped).
      - Photo with tree overlay (frame mapping, SVG viewBox = analysed pixel grid), minimum tier and reason,
        inline SVG, Blob-URL download. No pattern is rendered unless `ok` is true and an SVG is present.
      - Verified in headless Chromium: dog 6 leaves, Medium, pattern; beetle refusal, no pattern; no console
        errors; no horizontal overflow at 1280 or 390 px. Screenshots `tools/out/ui-*.png`.
      - Spec change, 2026-11-06 (user request): refusals in plain words. `refusal` is now
        `{ stage, message, detail }`: `message` is a one-sentence reason plus a one-sentence next step, with
        no solver terms; `detail` carries the technical cause. Status codes and `ok:false` are unchanged.
        Verified in the container: beetle -> `assignment` refusal in plain words, `detail` keeps `polys_multiple_ibps`.
        Other stages reworded but not each triggered by script (contract, tier, flatfold, solver).
      - Not done: keyboard and drag-drop were not exercised by script; `public/ort` (32 MB, imgly runtime) is now unused and not deleted.
- [ ] 5.4 Printable pattern with legend, paper size, step count, time estimate
- [ ] 5.5 Mobile at 390 px; deploy to a stable public URL
      - Spec change, 2026-11-06 (user decision): deployment requires a container host able to run
        the solver binary (a Docker image that builds `solver/` with cargo and runs `next start`),
        not a serverless platform. This is a deliberate trade against the original "no image leaves
        the device" claim; N3 now reads "no photograph is stored".
      - Container done (spec change, 2026-11-06, user request): `Dockerfile` (cargo release build,
        `next build` with `output: "standalone"`, runtime of server + static + solver,
        `FOLD_SOLVER=/app/bin/fold-solver`, runs as `node`, port 3000) and `.dockerignore`. Image 386 MB
        on disk, 93.8 MB content size. Verified by `docker build` and `docker run`: dog 200 ok:true, 6 leaves,
        medium, 55 vertices, 108 creases; text/plain 415; beetle 200 ok:false. Not done: the public URL.
        `public/ort` (unused) is not copied into the image.

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
- [x] MCP: a server exposing the reference models to the agent
      - `mcp/fixtures-server.ts`, registered as `fold-fixtures` in `.kiro/agents/fold-builder.json`
        (tools pre-approved in `allowedTools`; they are read-only). Resources, `list_fixtures` and
        `run_pipeline` on a fixture by name; no file writes. See `mcp/README.md`.
      - MCP stdio protocol is hand-written (no SDK installed, no dependency added); it supports
        initialize, ping, tools and resources only.
      - Verified: direct stdio calls, and `kiro-cli chat --agent fold-builder` called both tools and
        returned dog (ok, 6 leaves, Medium, 55 vertices, 108 creases) and beetle (refused, all F).
      - `kiro-cli agent validate` exits 0 on a deliberately malformed config, so it proves little.
- [ ] Custom agent: the reference-model reproduction agent
- [ ] Commit history showing spec → design → tasks → implementation, in that order
