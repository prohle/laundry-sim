import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pngjs from "pngjs";
import { analyseImage, kmeansRgb } from "./segment.ts";
import { prepareImage } from "./pipeline.ts";

const { PNG } = pngjs;

test("k-means is deterministic", () => {
  const img = prepareImage(readFileSync("fixtures/bush-dog.png")).img;
  const a = kmeansRgb(img), b = kmeansRgb(img);
  assert.deepEqual(Array.from(a.centres), Array.from(b.centres));
  assert.deepEqual(a.labels, b.labels);
});

for (const f of ["bush-dog.png", "snapping-turtle.jpg", "tuatara.jpg"]) {
  test(`${f}: one candidate, primary path, still folds`, async () => {
    const a = await analyseImage(readFileSync(`fixtures/${f}`));
    assert.equal(a.candidates.length, 1);
    assert.equal(a.segmentation.path, "primary");
    assert.equal(a.segmentation.fallbackReason, null);
    assert.equal(a.ok, true);
  });
}

test("two copies of a subject on one sheet give two candidates, both reach the solver", async () => {
  const one = PNG.sync.read(readFileSync("fixtures/bush-dog.png"));
  const gap = 60;
  const out = new PNG({ width: one.width * 2 + gap, height: one.height });
  out.data.fill(255);
  for (let y = 0; y < one.height; y++) {
    for (const ox of [0, one.width + gap]) {
      one.data.copy(out.data, (y * out.width + ox) * 4, y * one.width * 4, (y + 1) * one.width * 4);
    }
  }
  // Keep the sheet's own background uniform: the dog fixture's background is already near-white.
  const a = await analyseImage(new Uint8Array(PNG.sync.write(out)));
  assert.equal(a.candidates.length, 2);
  // The sheet is downscaled to 512 px wide, so each dog is at about half its fixture resolution and
  // is a different tree. Segmentation is what is tested: both are found and both reach the solver.
  // Whether each folds is the solver's verdict (one fails Kawasaki at this scale) and is not asserted.
  assert.ok(a.candidates.every((c) => c.leaves !== null && c.refusal?.stage !== "mask"));
  assert.ok(a.candidates.every((c) => c.areaShare > 0.05));
  assert.equal(a.ok, true, "the best candidate folds");
});
