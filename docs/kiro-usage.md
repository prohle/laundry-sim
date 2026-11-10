# How Kiro was used

This describes what was done in this repository with Kiro (`kiro-cli` 3.0.0) and what was not.
Where the repository does not settle a question, the text says so.

## The agent

`.kiro/agents/fold-builder.json` was scaffolded by `kiro-cli`, then edited by hand to add:

- a prompt: read `.kiro/steering/product.md` and `.kiro/specs/fold/tasks.md` before any change,
  implement only what `tasks.md` lists, and propose a spec change instead of writing code for
  anything else;
- resources: `file://.kiro/steering/**/*.md` and `file://.kiro/specs/fold/tasks.md` only. This was
  narrowed on 2026-11-08: the glob previously pulled `design.md` and `requirements.md` into every
  request as well, for 82.6 KB of fixed context. See "Credit accounting" below;
- a `postToolUse` hook (below);
- the `fold-fixtures` MCP server, with its two read-only tools in `allowedTools`;
- write permission limited to `src/`, `.kiro/`, `solver/`, `package.json` and `package-lock.json`.

Things we did not verify: `kiro-cli agent validate` exits 0 on a deliberately broken config, so
it is not evidence that the file is correct. The MCP server is evidenced by the agent calling it
(below). We have no direct evidence that the hook fires, only that its command is valid; see
the hook section.

Files such as `tools/`, `mcp/`, `Dockerfile` and `fixtures/` are outside that write list. The
repository does not record how they were written under it, so no claim is made.

## Hooks

One hook, inside the agent file:

- Trigger `postToolUse`, matcher `write`.
- Command: `npx tsc --noEmit 2>&1 | head -20`.
- Why: the project is TypeScript, and a type error introduced by a write should surface
  immediately rather than at the end of a task.

An early assumption was that hooks live in `.kiro/hooks/*.json`. Kiro's own documentation says
they live inside the agent file, and the commit that added the agent records that correction.
There is no `.kiro/hooks/` directory. A save-time hook for tests and a spec-drift hook are listed
in `tasks.md` and are not built.

## Steering

`.kiro/steering/product.md` is a list of things the product must never do and the voice it uses.
The constraints that bound the code:

- never claim "any object"; the supported class is four to twelve flaps, objects with limbs;
- never allow cuts;
- never present a library lookup as generation;
- never hide the minimum tier;
- never print a pattern without a valid mountain/valley assignment or an explicit collapse;
- never claim a faithful replica;
- plain voice, no exclamation marks.

Visible effects in the code: the pipeline refuses rather than printing an all-flat pattern (the
beetle), the minimum tier is on screen with its reason, and the screen carries the supported-class
line. Whether the steering file or the agent prompt caused any given behaviour cannot be separated
from the repository; both were loaded.

## Spec-driven development

The order in the history, honestly:

1. `bf4200d` (5 Nov) added `requirements.md`, `design.md` and `tasks.md` in one commit, for an
   earlier product (a relief generator).
2. The relief code was then written (`09b5327` onward), and the spec was replaced by a different
   product (`f999517`) and again by Fold (`1f5b97b`, 6 Nov), which rewrote all three files in one
   commit. So the three documents were not written one after another within a commit; they
   arrive together, before any origami code.
3. The origami implementation follows in later commits: solver (`dfdcd80`, `117095d`, `1c1c88b`),
   skeleton (`1200000`), pipeline, flat-foldability, API, screen, container, MCP.

After that, the spec was edited as findings arrived. The file contains 19 mentions of "spec
change" (one in `requirements.md`, two in `design.md`, sixteen in `tasks.md`), each dated and
saying whether it was a user request, decision or hypothesis. Examples: N3 changed from "no
photograph leaves the device" to "no photograph is stored" when the solver had to run on a
server; the default significance threshold changed from 1.0 to 2.0 after a sweep on one fixture.
`tasks.md` also records negative results (the simulator, the M/V swap) rather than deleting them.

We cannot show from the history that the spec was ahead of the code in every case. Several
`tasks.md` entries were written in the same commit as the work they describe.

## MCP

`mcp/fixtures-server.ts` is a stdio MCP server written by hand, with no SDK. It supports
`initialize`, `ping`, `tools/list`, `tools/call`, `resources/list` and `resources/read`, and
nothing else (`mcp/README.md`). It exposes:

- resources: each fixture's licence note and its image;
- `list_fixtures`: name, size, licence line, and whether a caveat applies;
- `run_pipeline`: runs the pipeline on a fixture by name (paths are rejected) and returns leaves,
  minimum tier, solver status, crease counts, flat-foldability counts and warnings. It writes no
  files.

Example, recorded in commit `e96db58`: running `kiro-cli chat --agent fold-builder`, the agent
called both tools. For the dog it returned 6 leaves, Medium, 55 vertices and 108 creases, with all
35 interior vertices flat-foldable. For the beetle it returned the refusal, with all 73 interior
vertices failing local flat-foldability. The point of the server is that the agent can check a
fixture's result in about half a second instead of running the CLI and reading its log.

## Credit accounting

`tools/credits.sh` reads `~/.kiro/sessions/*/*/messages.jsonl` and sums the `usage_summary` records.
Measured over 65 turns, 5-7 November:

| | |
|---|---|
| Turns | 65 |
| Model requests | 1,077 |
| Credits | 314.1 |
| Requests per turn | 16.6 |
| Credits per request | 0.292 |
| Tool calls that were `execute_bash` | 769 of ~1,120 (69%) |

Cost per request rises with context inside a turn: 0.154 credits for turns of 1-5 requests, 0.328 for
turns of 21-40. The 16 turns above 20 requests were 25% of the turns and 46% of the credits.

Two causes, both fixable:

1. **Fixed context.** The agent's `resources` glob loaded 82.6 KB on every request, of which
   `tasks.md` was 59.0 KB. 87% of that file was finished or partial work, and 43% was one completed
   phase.
2. **The bash loop.** Verification was five separate calls (`tsc`, `npm test`, `cargo test`, the
   fixture pipeline, `git status`), each a request that re-sent everything.

The diet, applied 2026-11-08:

- Completed and partial tasks moved to `.kiro/archive/tasks-done.md`, which the glob does not match.
  `tasks.md` went from 59.0 KB to 5.3 KB; all 33 open tasks are unchanged, and a short "Do not retry"
  list keeps the negative results that the narratives used to carry.
- The glob narrowed to `steering/**` plus `tasks.md`, dropping `design.md` and `requirements.md`
  from the default load.
- `.kiro/steering/workflow.md` makes `tools/check.sh` the only verification call, one task per turn,
  and reading each file once.
- Fixed context per request: **82.6 KB to 9.7 KB, an 88% cut.**

Not yet measured: credits per turn after the change. That is the next `tools/credits.sh` reading, and
it should be compared against the 4.83 mean above rather than asserted.

## Testing

`npm test` runs 52 Node tests; `cargo test --release` in `solver/` runs 10 (9 unit, 1 parity).

| Area | Tests | Covers |
|---|---|---|
| `skeleton.test.ts` | 11 | synthetic shapes, noise spurs, significance pruning, flap budget, determinism |
| `skeleton.photo.test.ts` | 1 | regression on the beetle mask for the junction bug |
| `tiers.test.ts` | 12 | tier boundaries, leaf sets nested across tiers, connected and acyclic trees at every budget |
| `contract.test.ts` | 8 | short-edge contraction, including a 0.009 edge that fails in the solver |
| `flatfold.test.ts` | 8 | Kawasaki and Maekawa on hand-built vertices |
| `tools/fold.test.ts` | 7 | FOLD export and its validator |
| `tools/cp-to-svg.test.ts` | 5 | SVG rendering |
| `solver` unit | 9 | JSON to `.tmd5`, convergence on stars, chains and a four-legged tree, coordinate normalisation |
| `solver/tests/parity.rs` | 1 | scale equal to the C++ reference on 3 of 3 models |

Property-based tests use `fast-check`: nine properties and 2,406 cases, run inside `npm test`
alongside the example-based tests. They cover tree invariants, tier monotonicity, contraction, the
`.tmd5` round trip, and pipeline determinism on both fixtures and generated silhouettes.

They found three defects the example-based tests had missed:

- a tree with subnormal coordinates hangs `treemaker-core`'s parser for over 300 s;
- the solver spawn had no timeout, so a pathological tree hung the API request;
- splicing used the chord, which collapsed two coincident nodes to a zero-length edge.

The golden test against a published crease pattern is still not done, because no published
reference with vertex and edge data has been found.

## What Kiro did well

- Reading the existing code and tasks before acting, and reporting negative results into
  `tasks.md` in the same session, including when the simulator did not fold our patterns.
- Finding a real bug that the synthetic tests could not: on the first real photograph, a junction
  split the skeleton into three graphs and the tree covered 44% of the silhouette instead of 99.2%.
  A photo-based regression test now guards it.
- Building `fold-solver` (JSON in, `.tmd5` text, crate optimiser, crease pattern out) and the
  parity test against the C++ reference output.
- Using the MCP server to check fixtures.

## What Kiro missed

- It tested the solver wrapper only on a 4-node star. That passed. Every real tree failed, because
  the optimiser starts from the node coordinates and they must lie inside the paper; outside the
  unit square the solver returned `ALM returned result code 1`, and an 8-node animal hung. The
  bug was found by pushing past that test with chains, larger stars and an 8-node four-legged
  tree, outside the agent's own checks, and the fix (normalising coordinates into [0.1, 0.9])
  came from that adversarial testing. The commit message `117095d` records this.
- The significance threshold. It was set at 1.0 as specified, did not separate spurs from limbs,
  and was moved to 2.0 on one clean fixture. Two further subjects then failed (turtle, tuatara).
  The default is a starting point and should not be read as a result.
- The first simulator runs, and the hypotheses about missing fold angles and inverted
  mountain/valley, did not explain the failure. The cause is open.
- `kiro-cli agent validate` accepted a broken config. We now rely on the tool call, not the
  validator.

## What we did not use

Nothing in the repository shows use of Kiro Powers, the Kiro task runner or sub-agents, so none is
claimed. The commit messages that mention Kiro refer to `kiro-cli chat` with the `fold-builder`
agent. Whether the IDE was used at any point is not recorded in the repository.
