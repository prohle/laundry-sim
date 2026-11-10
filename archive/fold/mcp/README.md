# Fold fixtures MCP server

An agent wants this because it can check a fixture's expected result (leaves, minimum tier, crease
pattern, fold counts, warnings) in about half a second, without re-running the whole CLI and
reading its log.

## What it exposes

Resources, two per image in `fixtures/` (read from disk on each request):

- `fixture://<name>`: the fixture's section of `fixtures/README.md` (source, author, licence,
  caveats), as `text/markdown`.
- `fixture-image://<name>`: the image itself, base64 in a `blob`.

Tools:

- `list_fixtures()`: name, mime, bytes, width, height, licence line, and `caveat` (true when the
  README attaches a caveat, such as a cut-out or an AI-modified background).
- `run_pipeline(image, options?)`: runs `src/lib/pipeline.ts` on a fixture by name. `image` must be
  a name from `list_fixtures`; paths are rejected. `options` (all optional): `maxLeaves`,
  `maxDim`, `significance`, `spur`, `contract`, with the pipeline's own defaults. Returns leaves,
  minimum tier and the tier table, solver status and `cp_status`, vertex and crease counts, fold
  distribution, local flat-foldability counts, `ok`, and `warnings` (refusals, faults, dropped
  leaves, FOLD validator messages, flat-fold failures). It writes no files.

A fixture's result is a property of that fixture and the current defaults. It is not a claim about
other photographs. Read the `caveat` field: `bush-dog.png` and `tuatara.jpg` are cut-outs.

## Run it

From the repo root, needing Node 24 (it runs `.ts` directly) and a built solver at
`solver/target/release/fold-solver` (or `FOLD_SOLVER` set):

```
node mcp/fixtures-server.ts
```

It speaks MCP over stdio (newline-delimited JSON-RPC 2.0). The protocol is implemented in the file
itself: `@modelcontextprotocol/sdk` is not installed and no dependency was added. It supports
`initialize`, `ping`, `tools/list`, `tools/call`, `resources/list`, `resources/read`; nothing else
(no prompts, no subscriptions). Node prints a `MODULE_TYPELESS_PACKAGE_JSON` warning to stderr;
stdout carries protocol messages only.

The `fold-builder` agent registers it in `.kiro/agents/fold-builder.json` as `fold-fixtures` and
pre-approves the two tools, which are read-only.
