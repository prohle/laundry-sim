import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runPipeline } from "./pipeline.ts";
import { assemblyNote } from "./multisheet.ts";

const load = (f: string) => new Uint8Array(readFileSync(new URL(`../../fixtures/${f}`, import.meta.url)));

test("single-sheet fixtures stay single-part", async () => {
  for (const f of ["bush-dog.png", "snapping-turtle.jpg", "tuatara.jpg"]) {
    const r = await runPipeline(load(f));
    assert.equal(r.multiSheet, null, f);
    assert.equal(r.ok, true, f);
    assert.equal(r.tree?.leaves, 6, f);
  }
});

test("beetle: split into parts covering every leaf; ok only if every part folds; refusal names the part", async () => {
  const r = await runPipeline(load("aphodius-foetens.jpg"));
  const ms = r.multiSheet!;
  assert.ok(ms, "multi-sheet path taken");
  assert.equal(ms.parts.reduce((s, p) => s + p.leaves, 0), r.tree!.leaves);
  assert.ok(ms.parts.every((p) => p.leaves <= 12));
  assert.equal(r.ok, ms.parts.every((p) => p.folds));
  if (!r.ok) assert.match(r.refusal!.message, /^Part \d+ does not fold/);
  assert.match(ms.assembly.note, /joined at a tab and needs glue or a slot/);
  assert.doesNotMatch(ms.assembly.note, /no glue/);
  for (const p of ms.parts) assert.equal(p.pattern !== null, p.folds);
});

test("assembly note names the junction and the part count", () => {
  const n = assemblyNote(["Part 1", "Part 2"], [{ node: 5, x: 100, y: 50 }], { width: 200, height: 100 });
  assert.match(n, /2 parts/);
  assert.match(n, /node 5.*50% across and 50% down/);
});
