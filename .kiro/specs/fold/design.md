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
Candidates, in order of fit for a browser product:

| Candidate | Language | Fit | Risk |
|---|---|---|---|
| **TreeFaker** (MIT 6.849) | JS/Vue, browser | runs client-side, no backend | student project, parity unknown |
| **treemaker-core** | Rust + WASM | headless API, has flat-fold and sequence crates | young port, no CFSQP/RFSQP, needs a Rust toolchain |
| **TreeMaker 5 source** | C++ (GPL) | the reference implementation | `g++` and `make` are available; not browser-native |
| **box-pleating**, **pleat** | Python | verification, FOLD I/O, flat-foldability ILP | not a tree solver |

**Local toolchain, verified 2026-11-06:** `node` 24, `npm` 11, `python3`, `g++`, `make` present.
**No `cargo` or `rustup`.** Network access to GitHub works.

So the order is TreeFaker → C++ reference → Rust port. The C++ path is the fallback if TreeFaker's
parity is poor, and `g++` is already there.

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
