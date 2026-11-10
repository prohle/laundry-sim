# How Kiro was used

Kiro (`kiro-cli` 3.1.0) built the simulator, the evaluation harness and the MCP server. This describes
what was done, what it cost, and where the agent failed — including the failures it caught itself.

## The agent

`.kiro/agents/sim-builder.json`:

- a prompt that names the three files to read first and forbids work outside `tasks.md`;
- resources: `.kiro/steering/**/*.md` and `.kiro/specs/laundry/tasks.md` only;
- a `postToolUse` hook on `write` that runs `sim/check.py`;
- the `sim-tools` MCP server, with `eval_suite`, `run_episode` and `render_clip` in `allowedTools`;
- write permission limited to `sim/`, `.kiro/`, `briefs/` and `tools/`.

## Hooks

One hook, inside the agent file:

- trigger `postToolUse`, matcher `write`;
- command: `cd sim && .venv/bin/python check.py | tail -5`;
- why: a write that breaks the scene or the fold should surface immediately, not at the end of a task.

The hook fired on every write. It is slow — `check.py` takes about 50 s — and one call hit the 120 s
timeout. The fix is a fast subset for the hook and the full suite on demand, and it is not built.

## Steering

Two files, both short because they are re-sent on every request:

- `.kiro/steering/product.md` — the claim is simulation-only; never claim a machine; never report a
  fold without the check; no asset without a redistributable licence; never call a proxy a measurement.
- `.kiro/steering/workflow.md` — one verification call (`sim/check.py`), one task per turn, read once,
  write small, and never retry a recorded failure.

The licence rule was written before any code and no asset was ever downloaded. The product rule is why
the README says "simulated" in the first line and the eval output prints it under every table.

## Spec-driven development

`requirements.md`, `design.md` and `tasks.md` were written before the first line of simulator code. The
task list was edited as findings arrived, and the edits are in the git history:

- 2.3 was superseded by 2.2b when the fold check turned out to be too weak (a heap passed it);
- 3.3 was narrowed from yaw ±20° to position-only after the agent proved the yaw condition was
  geometrically impossible;
- 3.7 was added when the reach diagnostic showed the shoulders sat at the yaw singularity;
- 4.4 was attempted and recorded as failed rather than deleted;
- 4.5 and 4.6 were added when the patch fix needed a clean test.

The agent refused to implement a task that was not in `tasks.md` twice (2.2b, 3.7), and refused a
brief that contradicted the spec once (brief 14 vs task 3.7). Those refusals cost 0.18 and 0.24 credits
and saved a wrong implementation.

## MCP

`sim/mcp_server.py` is a stdio server in plain Python, no SDK: `initialize`, `ping`, `tools/list`,
`tools/call`, nothing else. It exposes:

- `eval_suite(runs, seed, policy)` → success, runs, distinct drops, mean time, mean wrinkle;
- `run_episode(seed, policy)` → the four check numbers for one drop;
- `render_clip(out)` → path, frames.

The point is that the agent asks for counts, not logs. A call returns a JSON object in about 8 s for two
runs. Simulator prints go to stderr so stdout stays protocol-only, and NaN becomes `null` because JSON
has no NaN.

## Testing

`sim/check.py` runs 13 checks in about 50 s: garment generation, scene parts, the cloth resting on the
shelf, a render that is not a flat colour, determinism, the arms, the ready pose, corner detection,
the fold, and two reproducibility checks.

There is **no property-based testing library** in this repository. The checks are example-based, and
this document says so rather than implying otherwise. Property tests over the cloth invariants
(vertex count, no NaN, energy bounds) are listed as task 6.4 and are not built.

## Credit accounting

Measured with `tools/credits.sh`, which reads `~/.kiro/sessions/*/*/messages.jsonl`.

| | before the diet (65 turns) | this build (19 turns) |
|---|---|---|
| credits per turn | 4.83 | **1.73** |
| requests per turn | 16.6 | **8.2** |
| fixed context per request | 82.6 KB | **9.5 KB** |
| credits spent | 314.1 | **32.9** |

The diet: completed tasks archived out of the load path, the resources glob narrowed to `tasks.md`,
`design.md` and `requirements.md` dropped from the default load, one verification call, and one task
per brief.

Two turns broke the one-task rule (brief 09 covered 3.1+3.3, brief 17 covered 4.1–4.3) and were the
two most expensive (3.17 and 2.48 credits). The rest averaged about 1.5.

## What Kiro did well

- **Refused out-of-spec work.** Three times, cheaply, and each refusal was correct.
- **Caught its own dishonesty risk.** After the 50/50 result it flagged that seeds 6–10 were no longer
  held-out and that 50 runs were only 14 distinct drops. That is the difference between a result and a
  claim.
- **Found real bugs by measurement, not guesswork:** MJCF angles are degrees, not radians; the gripper
  fingers opened into the wall; flex qpos is a displacement, not a world position; the qpos offset is
  `12 + 3i`, not `3 * (vertadr + i)`.
- **Ran a geometric diagnostic instead of trial and error** when the shoulder limit blocked the carry,
  and produced the table that led to the base move.

## What Kiro missed

- **The corner detector was wrong for a whole task.** It passed 9/9 at yaw 0 and would have failed
  silently at yaw ±20°; the agent only measured that when asked.
- **The first fold check was too weak.** `ratio 0.38, overlap 1.00` passed a fold that could have been
  a heap. The PM caught it, not the agent.
- **Two brief/spec conflicts** were partly the PM's fault, but the agent followed the brief rather than
  the spec on the first one.
- **It did not notice the hook's 50 s runtime** until it hit the timeout.

## What we did not use

Nothing in the repository shows use of Kiro Crew or Kiro Powers, so neither is claimed. The IDE was
used for reading diffs; every implementation turn ran through `kiro-cli chat --agent sim-builder`.
