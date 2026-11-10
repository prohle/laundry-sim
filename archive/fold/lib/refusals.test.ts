import { test } from "node:test";
import assert from "node:assert/strict";
import pngjs from "pngjs";
import { assessMask, runPipeline, MULTI_OBJECT_RATIO, RECTANGULARITY_LIMIT } from "./pipeline.ts";
import { extractTree } from "./skeleton.ts";

const { PNG } = pngjs;

interface Canvas {
  mask: Uint8Array;
  width: number;
  height: number;
}

const canvas = (width: number, height: number): Canvas => ({ mask: new Uint8Array(width * height), width, height });

function fill(c: Canvas, inside: (x: number, y: number) => boolean): Canvas {
  for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (inside(x, y)) c.mask[y * c.width + x] = 1;
  return c;
}
const rect = (c: Canvas, x0: number, y0: number, w: number, h: number) =>
  fill(c, (x, y) => x >= x0 && x < x0 + w && y >= y0 && y < y0 + h);
const disc = (c: Canvas, cx: number, cy: number, r: number) => fill(c, (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r);
const ellipse = (c: Canvas, cx: number, cy: number, rx: number, ry: number) =>
  fill(c, (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);

/** Dark shape on a white background, as PNG bytes, so the whole pipeline can be driven. */
function toPng(c: Canvas): Uint8Array {
  const png = new PNG({ width: c.width, height: c.height });
  for (let i = 0; i < c.width * c.height; i++) {
    const v = c.mask[i] ? 30 : 255;
    png.data[i * 4] = png.data[i * 4 + 1] = png.data[i * 4 + 2] = v;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

// A solver path that cannot run: any run that gets past every refusal ends in a fault, not a refusal.
const NO_SOLVER = "/nonexistent/fold-solver";
const run = (c: Canvas) => runPipeline(toPng(c), { solverPath: NO_SOLVER, maxDim: 512 });

const disc1 = () => disc(canvas(200, 200), 100, 100, 60);
const discs2 = () => disc(disc(canvas(300, 200), 80, 100, 55), 220, 100, 50);
const filledRect = () => rect(canvas(200, 200), 30, 50, 140, 100);
const plusSign = () => rect(rect(canvas(101, 101), 5, 45, 91, 11), 45, 5, 11, 91);
const longEllipse = () => ellipse(canvas(300, 200), 150, 100, 120, 30);

test("assessMask: one disc is one component, not a rectangle", () => {
  const c = disc1();
  const a = assessMask(c.mask, c.width, c.height);
  console.log(`  disc: ${JSON.stringify({ ...a, components: a.components })}`);
  assert.equal(a.components.length, 1);
  assert.equal(a.significantComponents, 1);
  assert.equal(a.largestShare, 1);
  assert.ok(a.coverage > 0.02 && a.coverage < 0.9);
  assert.ok(a.rectangularity > 0.7 && a.rectangularity < RECTANGULARITY_LIMIT, `rectangularity ${a.rectangularity}`);
});

test("assessMask: components are sorted largest first and counted by pixels", () => {
  const c = rect(rect(canvas(50, 50), 0, 0, 10, 10), 20, 20, 5, 5);
  const a = assessMask(c.mask, c.width, c.height);
  assert.deepEqual(a.components, [100, 25]);
  assert.equal(a.foregroundPixels, 125);
  assert.equal(a.largestShare, 100 / 125);
  assert.equal(a.coverage, 125 / 2500);
  assert.equal(a.rectangularity, 1);
  assert.equal(a.significantComponents, 2); // 25 >= 15% of 100
});

test("assessMask: an empty mask does not divide by zero", () => {
  const a = assessMask(new Uint8Array(100), 10, 10);
  assert.deepEqual(a, { coverage: 0, foregroundPixels: 0, components: [], largestShare: 0, significantComponents: 0, rectangularity: 0 });
});

test("one disc passes the mask checks", async () => {
  const r = await run(disc1());
  assert.notEqual(r.refusal?.stage, "mask");
});

test("two discs of similar size are refused as more than one object", async () => {
  const c = discs2();
  const a = assessMask(c.mask, c.width, c.height);
  assert.equal(a.significantComponents, 2);
  const r = await run(c);
  assert.equal(r.refusal?.stage, "mask");
  assert.equal(r.refusal?.message, "This looks like more than one object. Photograph one object on its own.");
  assert.match(r.refusal!.detail!, /2 components/);
  assert.doesNotMatch(r.refusal!.message, /\d/); // numbers live in detail
});

test("a small second blob under 15% of the largest is not a second object", () => {
  const c = rect(disc(canvas(300, 200), 100, 100, 70), 250, 100, 8, 8);
  const a = assessMask(c.mask, c.width, c.height);
  assert.equal(a.components.length, 2);
  assert.ok(a.components[1] < MULTI_OBJECT_RATIO * a.components[0]);
  assert.equal(a.significantComponents, 1);
});

test("a filled rectangle is refused as nearly a rectangle", async () => {
  const r = await run(filledRect());
  assert.equal(r.refusal?.stage, "mask");
  assert.equal(
    r.refusal?.message,
    "This shape is nearly a rectangle, so there is nothing to fold. Try an object with a distinctive outline.",
  );
  assert.match(r.refusal!.detail!, /rectangularity 1\.000/);
  assert.doesNotMatch(r.refusal!.message, /\d/);
});

test("a plus sign passes the mask checks and has 4 leaves, so the leaf rule does not fire", async () => {
  const c = plusSign();
  const a = assessMask(c.mask, c.width, c.height);
  assert.equal(a.significantComponents, 1);
  assert.ok(a.rectangularity < RECTANGULARITY_LIMIT, `rectangularity ${a.rectangularity}`);
  const leaves = extractTree(c).leaves;
  assert.equal(leaves, 4);
  const r = await run(c);
  // Past every refusal: it reaches the (absent) solver and ends in a fault.
  assert.equal(r.refusal, null);
  assert.match(r.fault ?? "", /could not run/);
});

test("an elongated ellipse passes the mask checks but is refused for too few limbs", async () => {
  const c = longEllipse();
  const a = assessMask(c.mask, c.width, c.height);
  assert.equal(a.significantComponents, 1);
  assert.ok(a.rectangularity < RECTANGULARITY_LIMIT);
  const r = await run(c);
  console.log(`  ellipse: rectangularity ${a.rectangularity.toFixed(3)}, refusal ${r.refusal?.stage}: ${r.refusal?.detail}`);
  assert.equal(r.refusal?.stage, "tree");
  assert.equal(r.refusal?.message, "This shape has too few limbs to fold. Try an animal or an object with clear protrusions.");
  assert.doesNotMatch(r.refusal!.message, /\d/);
});

test("a tiny speck is still refused as no single object (coverage under 2%)", async () => {
  const r = await run(disc(canvas(200, 200), 100, 100, 8));
  assert.equal(r.refusal?.stage, "mask");
  assert.equal(r.refusal?.message, "I can't find a single object. Try a plainer background.");
});

test("a shape filling the frame is still refused as no single object (coverage over 90%)", async () => {
  // 192 x 192 in a 200 x 200 frame with a 4 px background border: 92% coverage.
  const c = rect(canvas(200, 200), 4, 4, 192, 192);
  const r = await run(c);
  assert.equal(r.refusal?.stage, "mask");
  assert.equal(r.refusal?.message, "I can't find a single object. Try a plainer background.");
  assert.match(r.refusal!.detail!, /92\.2%/);
});
