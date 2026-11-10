import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import jpeg from "jpeg-js";
import pngjs from "pngjs";
import { analyseViews, disagreementMessage, outOfFrame } from "./views.ts";

const { PNG } = pngjs;

test("disagreement message names both counts; silent when views agree", () => {
  const m = disagreementMessage([
    { view: 1, leaves: 4, folds: true, chosen: false },
    { view: 2, leaves: 6, folds: true, chosen: true },
  ]);
  assert.match(m!, /view 1 found 4 flaps/);
  assert.match(m!, /view 2 found 6 flaps/);
  assert.equal(disagreementMessage([{ view: 1, leaves: 6, folds: true, chosen: true }, { view: 2, leaves: 6, folds: true, chosen: false }]), null);
});

test("turtle cropped to lose the rear leg, paired with the full image", async () => {
  const src = jpeg.decode(readFileSync("fixtures/snapping-turtle.jpg"), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 2048 });
  const x0 = Math.floor(src.width * 0.6), w = src.width - x0;
  const crop = new PNG({ width: w, height: src.height });
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * src.width + x0 + x) * 4, d = (y * w + x) * 4;
      for (let k = 0; k < 4; k++) crop.data[d + k] = src.data[s + k];
    }
  }
  mkdirSync("tools/out", { recursive: true });
  const cropBytes = PNG.sync.write(crop);
  writeFileSync("tools/out/turtle-crop.png", cropBytes); // not a fixture
  const a = await analyseViews([cropBytes, readFileSync("fixtures/snapping-turtle.jpg")]);
  console.log(JSON.stringify(a.views), "\nDISAGREEMENT:", a.disagreement);
  assert.equal(a.views.length, 2);
  // The crop touches the frame border, so it is refused as incomplete, not counted.
  assert.equal(a.views[0].leaves, null);
  assert.equal(a.views[0].folds, false);
  assert.equal(a.views[0].refusal?.stage, "frame");
  assert.equal(a.views[0].refusal?.message, "The object runs out of frame in this view. Fit the whole object in the photograph.");
  assert.match(a.views[0].refusal!.detail!, /pixels on the frame border/);
  assert.equal(a.views[1].refusal, null);
  assert.ok(a.views[1].leaves! > 0);
  assert.equal(a.views.filter((v) => v.chosen).length, 1);
  assert.equal(a.views[1].chosen, true);
  assert.match(a.disagreement!, /view 1 was set aside because the object runs out of frame/);
  assert.match(a.disagreement!, new RegExp(`${a.views[1].leaves} flaps`));
});

test("full fixtures do not touch the frame border", () => {
  for (const f of ["snapping-turtle.jpg", "bush-dog.png", "tuatara.jpg"]) assert.equal(outOfFrame(readFileSync(`fixtures/${f}`)), null, f);
});
