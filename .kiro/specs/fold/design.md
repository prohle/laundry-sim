# Fold — design

## The thesis

> **A photograph becomes a foldable crease pattern, at the complexity you choose.**

The claim is the derivation, not the tutorial. Origami tutorial apps are a commodity and a library
lookup is spotted in one sentence. The novel part is that the flap structure comes out of the
photograph.

## Pipeline

```
photograph
  → segment (silhouette)
  → skeleton (limbs, medial axis)
  → tree (flap count, edge lengths)        ← the design artefact
  → circle/river packing                   ← the solver
  → crease pattern
  → flat-foldability check + state count
  → mountain/valley assignment, or a collapse instruction
  → renderer: 3D base, collapse animation, printable pattern, paper spec
  → measure: recognition vs complexity
```

### Multi-sheet (spec change, 2026-11-06, user request)

When the tree has more than 12 leaves it is partitioned, not refused. Pick the highest-degree node
(the junction); remove it and take each hanging subtree. A part is a subtree plus the junction as its
root, so it is a valid tree on its own. A part still above 12 leaves is split again by the same rule
inside that part. Every leaf lands in exactly one part. Parts are ordered by leaf count, largest first,
and named Part 1, Part 2. Each part runs the ordinary tier rules and solve; the view folds only if all
parts fold. The result is joined at a tab with glue or a slot, so it is never described as
"one square, no cuts, no glue".

The tree is the intermediate representation. Everything downstream is a pure function of it.

## Why no cuts

Cutting makes it kirigami. More importantly, tree theory assumes the sheet is one connected square:
a cut edge is a boundary, not a hinge, and the circle packing stops describing the object. So
"no cuts" is not a stylistic choice — it is a precondition of the solver.

## Complexity ladder

| Tier | Flaps | Grid | Steps | Time | Paper | Typical subject |
|---|---|---|---|---|---|---|
| Easy | 4 | 16×16 | ~20 | 15 min | 80 gsm | bird: two wings, head, tail |
| Medium | 6 | 24×24 | ~40 | 40 min | 80 gsm | four-legged animal |
| Hard | 8 | 32×32 | ~80 | 1.5 h | 60–80 gsm | animal with ears or a second detail |
| Expert | 10–12 | 48×48 | ~150 | 3 h | tissue foil | insect: six legs, two antennae |

Step and time figures are **estimates to be measured** on the first three reference models. They
are not marketing numbers and they get corrected or the interface lies.

### The minimum rule

Complexity is not a free dial. Below a minimum flap count the subject is not representable: a
four-legged animal needs six flaps, a beetle needs ten. The app computes the minimum from the
proposed tree and refuses below it, with the reason.

This refusal is a feature. It is specific, it is true, and it teaches the user one thing about
origami in a sentence.

## The solver

TreeMaker-grade means circle/river packing plus molecule generation. It is not being reimplemented.
Candidates, in order of fit for a browser product (spec change, 2026-11-06: the chosen solver is a
native binary run server-side, see "Deployment"):

| Candidate | Language | Fit | Risk |
|---|---|---|---|
| **treemaker-core** 0.1.0 (chosen) | Rust + WASM | headless API; GPL-2.0-or-later; 5 of 5 shipped `.tmd5` examples converged and reported feasible, 4 of 5 built a crease pattern, 0–7 ms per model | 1 of 5 failed: `invalid operation: polygon inset distance was not found`; input is `.tmd5` text only |
| **TreeMaker 5 source** | C++ (GPL) | the reference implementation; fallback | `g++` and `make` are available; not browser-native |
| **TreeFaker** (MIT 6.849) | JS/Vue, browser | engine ran headlessly; fiveStar and bone solved in ~150 ms | no licence, cannot be vendored; crab tree failed with `twisted`; all creases `Unknown` |
| **box-pleating**, **pleat** | Python | verification, FOLD I/O, flat-foldability ILP | not a tree solver |

**Local toolchain:** `node` 24, `npm` 11, `python3`, `g++`, `make` verified 2026-11-06. Rust
installed 2026-11-06; treemaker-core 0.1.0 built with cargo 1.99.1. Network access to GitHub works.

**Evaluation result.** treemaker-core was run against the five example models in the TreeMaker 5
C++ source (`Source/test/tmModelTester/*.tmd5`). All five converged and reported feasible. Four
built a crease pattern; one failed with `invalid operation: polygon inset distance was not found`.
Runtime was 0 to 7 ms per model. The API is `Tree::from_tmd_str`, `optimize_scale`,
`optimize_edges`, `optimize_strain`, `build_polys_and_crease_pattern`, `to_tmd5_string`,
`cp_status` and `summary`. This is not yet a parity result: no crease pattern has been diffed
against a published reference (tasks 1.3 and 1.4).

**Input format.** There is no programmatic tree constructor. The only input is TreeMaker's
`.tmd5` text format, so a tree-to-`.tmd5` serialiser is required (task 1.9).

The chosen solver is treemaker-core. The C++ reference remains the fallback.

### Deployment (spec change, 2026-11-06, user decision)

The pipeline is an HTTP API (`POST /api/fold`), not a browser library. The browser cannot run the
Rust solver and a WASM port is not a 28-day item. The photograph is uploaded, processed in memory
for the duration of the request and discarded (N3). The solver binary is located by the
`FOLD_SOLVER` environment variable, defaulting to `solver/target/release/fold-solver`. Hosting
therefore needs a container host that can run that binary; see task 5.5.

### Licensing, verified 2026-11-06

- **TreeFaker** (6849-2020/treefaker) has no licence: GitHub reports NONE, there is no LICENSE
  file and no licence field. It cannot be vendored or copied.
- **TreeMaker 5** C++ source is GPL-2.0-or-later.
- **treemaker-core** is GPL-2.0-or-later.
- **BP Studio** is MIT.

This repo is AGPL-3.0. It can absorb GPL-2.0-or-later code but not unlicensed code.

### Parity gate

Reproduce a shipped reference model and diff the crease pattern against the original. Until that
passes, no claim about the solver is made.

## Mountain/valley

Raw TreeMaker output is unassigned. Two facts shape the design:

- **Kawasaki and Maekawa are local.** They constrain angle sums and mountain/valley counts at a
  vertex. They are necessary, not sufficient.
- **The assignment is not unique.** A flat-foldable pattern can have many valid folded states.
  Pushing the paper selects one; inverting a fold switches to another.

So the product does not pretend to compute a unique answer. It computes the **state count**:

- One state → print a full mountain/valley assignment. Rigid and safe.
- More than one → print the collapse and a push direction. The folder resolves the rest.

The count is also a quality metric: a pattern with forty states is ambiguous and the app should say
so before the user cuts paper.

## Rendering

- **Preview** — orbitable 3D of the folded base, from the tree.
- **Collapse** — one motion, crease pattern to base. This is the performance, and it is the video.
- **Pattern** — printable, with solid and dashed creases, a legend, and the paper size.
- **Ladder** — the same photograph at four tiers, side by side. One image explains the product.

## Failure states

| Condition | Behaviour |
|---|---|
| Silhouette > 90% or < 2% of frame | "I can't find a single object. Try a plainer background." |
| No distinguishable limbs | "This shape has no limbs to fold. Try an animal or an object with a clear outline." |
| Subject needs more flaps than the tier allows | "Four flaps cannot make six legs. The cheapest version of this subject is Hard." |
| A part fails to fold | The view is refused and names the part. |
| Packing fails to fit | Reduce the grid by one step and retry, twice, then refuse. |
| State count above a threshold | Warn: "this pattern has many valid folds; follow the collapse arrow." |
| Paper too thick for the grid | State the required paper before printing. |

## Testing

- **Property** — the tree round-trips through JSON without loss.
- **Property** — every tier's tree is a subgraph of the next tier's tree (monotonicity).
- **Property** — a solved pattern passes Kawasaki and Maekawa at every interior vertex.
- **Golden** — three reference models reproduced against their published crease patterns.
- **Snapshot** — the printable pattern for one fixture at each tier.
- **Determinism** — the same photograph and tier produce the same tree and pattern.

## Deliberate omissions

No cuts. No glue. No curved creases. No wet folding. No faces. No models above twelve flaps. No
robot folding. No claim of general origami design.

## Risks and gates

| Risk | Why it matters | Gate |
|---|---|---|
| **Photo → tree** | The novel part; everything downstream depends on it | 20 Nov |
| **Solver parity** | The port may not match the reference | 10 Nov |
| **Mountain/valley** | No assignment, no printable pattern | 15 Nov |
| **Fold sequence** | A valid pattern does not tell you the order | not promised |
| **Does it read?** | All of the above can pass and the paper still look like a crumple | 25 Nov |

Miss a gate → cut scope, not the video.
