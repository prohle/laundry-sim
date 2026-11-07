import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runPipeline } from "./pipeline.ts";
import { validateEditedTree } from "./tree-validate.ts";

const dog = readFileSync(new URL("../../fixtures/bush-dog.png", import.meta.url));

const frame = { originX: 0, originY: 0, scale: 100 };
const good = () => ({
  nodes: [
    { id: 0, x: 0.2, y: 0.2 },
    { id: 1, x: 0.5, y: 0.5 },
    { id: 2, x: 0.8, y: 0.3 },
  ],
  edges: [
    { from: 0, to: 1, length: 0.4 },
    { from: 1, to: 2, length: 0.4 },
  ],
  frame,
});

test("posting the dog's own tree back gives the same crease count as the image route", async () => {
  const fromImage = await runPipeline(new Uint8Array(dog));
  assert.equal(fromImage.ok, true, "the image route must succeed on the dog");
  const sent = JSON.parse(JSON.stringify(fromImage.tree));
  const v = validateEditedTree(sent);
  assert.ok(v.ok, v.ok ? "" : v.message);
  const fromTree = await runPipeline(new Uint8Array(dog), { tree: v.tree });
  assert.equal(fromTree.ok, true);
  assert.equal(fromTree.solver!.cp!.creases.length, fromImage.solver!.cp!.creases.length);
  assert.equal(fromTree.solver!.cp!.vertices.length, fromImage.solver!.cp!.vertices.length);
  assert.equal(fromTree.tree!.leaves, fromImage.tree!.leaves);
  assert.equal(fromTree.minimum!.tier, fromImage.minimum!.tier);
  assert.equal(fromTree.coverage, null, "extraction was skipped");
});

test("a valid small tree is accepted and degree and leaves are recomputed", () => {
  const v = validateEditedTree({ ...good(), leaves: 99 });
  assert.ok(v.ok);
  assert.equal(v.tree.leaves, 2);
  assert.deepEqual(v.tree.nodes.map((n) => n.degree), [1, 2, 1]);
});

test("invalid trees are rejected with a message", () => {
  const cases: [string, (t: any) => unknown][] = [
    ["not an object", () => null],
    ["one node", (t) => ({ ...t, nodes: [t.nodes[0]], edges: [] })],
    ["too few edges", (t) => ({ ...t, edges: [t.edges[0]] })],
    ["a cycle (edges == nodes)", (t) => ({ ...t, edges: [...t.edges, { from: 0, to: 2, length: 0.5 }] })],
    ["disconnected, right edge count", (t) => ({ ...t, edges: [t.edges[0], { from: 0, to: 1, length: 0.3 }] })],
    ["a NaN coordinate", (t) => ({ ...t, nodes: [{ ...t.nodes[0], x: NaN }, ...t.nodes.slice(1)] })],
    ["a null coordinate (JSON NaN)", (t) => ({ ...t, nodes: [{ ...t.nodes[0], x: null }, ...t.nodes.slice(1)] })],
    ["x above 1", (t) => ({ ...t, nodes: [{ ...t.nodes[0], x: 1.01 }, ...t.nodes.slice(1)] })],
    ["x below 0", (t) => ({ ...t, nodes: [{ ...t.nodes[0], x: -0.01 }, ...t.nodes.slice(1)] })],
    ["zero length", (t) => ({ ...t, edges: [{ ...t.edges[0], length: 0 }, t.edges[1]] })],
    ["negative length", (t) => ({ ...t, edges: [{ ...t.edges[0], length: -1 }, t.edges[1]] })],
    ["unknown node in an edge", (t) => ({ ...t, edges: [{ from: 0, to: 9, length: 1 }, t.edges[1]] })],
    ["self loop", (t) => ({ ...t, edges: [{ from: 1, to: 1, length: 1 }, t.edges[1]] })],
    ["duplicate node id", (t) => ({ ...t, nodes: [t.nodes[0], t.nodes[0], t.nodes[2]] })],
    ["no frame", (t) => ({ nodes: t.nodes, edges: t.edges })],
  ];
  for (const [name, mutate] of cases) {
    const v = validateEditedTree(mutate(good()));
    assert.equal(v.ok, false, `${name} must be rejected`);
    if (!v.ok) assert.ok(v.message.length > 10, `${name}: message`);
  }
});
