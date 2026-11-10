# Brief 21 — the sim-tools MCP server

Implement task **6.1** only. This is a judged artefact (Kiro MCP) and a credit saving: the agent should
ask for counts, not read logs.

## `sim/mcp_server.py`

A stdio MCP server in plain Python, no SDK, JSON-RPC 2.0, one object per line. Port the shape of the
existing `mcp/fixtures-server.ts` (read it first): `initialize`, `ping`, `tools/list`, `tools/call`.
Nothing else.

Tools, each returning a small JSON object (never a log):

| tool | args | returns |
|---|---|---|
| `eval_suite` | `runs` (int, default 10), `seed` (int, default 1), `policy` (`scripted`) | `{success, runs, distinct_drops, mean_time, mean_wrinkle, seconds}` |
| `run_episode` | `seed` (int), `policy` | `{result, width, depth, ontop, seconds}` |
| `render_clip` | `out` (path, default `sim/out/clip.mp4`) | `{path, frames, seconds}` |

- `eval_suite` imports `eval.py` and runs in-process; do not shell out to a subprocess.
- `run_episode` runs one drop and returns the four check numbers.
- `render_clip` calls the existing video path for 30 frames (a short clip, not the full 120).
- Every tool must finish under 60 s; `eval_suite` with 10 runs is about 15 s.

## Wire it into the agent

Add to `.kiro/agents/sim-builder.json`:

```json
"mcpServers": { "sim-tools": { "command": "sim/.venv/bin/python", "args": ["sim/mcp_server.py"] } },
"allowedTools": ["@sim-tools/eval_suite", "@sim-tools/run_episode", "@sim-tools/render_clip"]
```

## Self-test

`sim/mcp_server.py --selftest` sends `initialize`, `tools/list`, then `tools/call eval_suite {runs:2,
seed:11}` through the same handler and prints the three responses. Exit non-zero if any is malformed.

## Acceptance

- `sim/.venv/bin/python sim/mcp_server.py --selftest` prints valid JSON-RPC responses and exits 0.
- `check.py` passes.
- The agent config parses as JSON.

## Report

The self-test output, the tool list, the wall time of `eval_suite` with 2 runs, and anything in the
existing TS server you chose not to copy. Do not commit.
