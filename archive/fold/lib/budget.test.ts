import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyseImage } from "./segment.ts";

const turtle = readFileSync("fixtures/snapping-turtle.jpg");

test("a budget below the required flaps is refused, naming the count and the tier that works", async () => {
  const r = await analyseImage(turtle, { budget: 4 });
  assert.equal(r.ok, false);
  assert.equal(r.refusal?.stage, "tier");
  assert.equal(r.refusal?.message, "This subject needs 6 flaps; Easy allows 4. The cheapest version is Medium.");
  assert.equal(r.budget?.used, null);
});

test("the minimum budget gives the same tree as no budget", async () => {
  const a = await analyseImage(turtle, {});
  const b = await analyseImage(turtle, { budget: 6 });
  assert.deepEqual(b.tree, a.tree);
  assert.equal(b.budget?.requested, 6);
  assert.equal(a.budget?.requested, null);
});

test("a higher budget keeps more flaps and re-solves", async () => {
  const a = await analyseImage(turtle, {});
  const b = await analyseImage(turtle, { budget: 8 });
  assert.equal(b.tree?.leaves, 8);
  assert.notDeepEqual(b.solver?.cp, a.solver?.cp);
});
