import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pngjs from "pngjs";
import { extractTree } from "./skeleton.ts";

const { PNG } = pngjs;

// Regression: fixtures/aphodius-foetens.mask.png is the mask tools/pipeline.ts derives from a
// CC0 photograph (see fixtures/README.md). Its skeleton has a "fat" junction (staircase pixels
// around a junction pixel). Before the fix in buildGraph, a branch walk curled round that
// junction, the graph split in three, makeTree kept only the left part, and the long hind leg
// at the right of the beetle was missing from the tree.
test("real beetle mask: the tree reaches the hind leg", () => {
  const png = PNG.sync.read(readFileSync(new URL("../../fixtures/aphodius-foetens.mask.png", import.meta.url)));
  const { width, height } = png;
  const mask = new Uint8Array(width * height);
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < mask.length; i++) {
    if (png.data[i * 4] < 128) {
      mask[i] = 1;
      const x = i % width;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  }
  const tree = extractTree({ mask, width, height }, { significanceThreshold: 0, spurThreshold: 0 });
  const xs = tree.nodes.map((n) => tree.frame.originX + n.x * tree.frame.scale);
  const reach = (Math.max(...xs) - Math.min(...xs)) / (maxX - minX);
  console.log(`  beetle: leaves=${tree.leaves} nodes=${tree.nodes.length} reach=${reach.toFixed(3)}`);
  assert.equal(tree.edges.length, tree.nodes.length - 1, "one connected tree");
  assert.ok(reach > 0.9, `tree spans only ${(reach * 100).toFixed(0)}% of the silhouette's width`);
});
