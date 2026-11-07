import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyseViews } from "./views.ts";
import { shortReason } from "./ladder.ts";

test("shortReason names the failures the screen shows", () => {
  const r = (stage: string, message = "x") => ({ stage, message, detail: null });
  assert.equal(shortReason(r("assignment"), "polys_not_valid", 6), "solver could not pack it");
  assert.equal(shortReason(r("flatfold"), "has_full_cp", 6), "would not lie flat");
  assert.equal(shortReason(r("tier"), null, 6), "needs 6 flaps");
});

test("the turtle reports all four tiers; only the ones that fold are ok; the top level is the highest that folds", async () => {
  const r = await analyseViews([readFileSync("fixtures/snapping-turtle.jpg")]);
  const tiers = r.views[0].tiers!;
  assert.deepEqual(tiers.map((t) => t.tier), ["easy", "medium", "hard", "expert"]);
  assert.deepEqual(tiers.map((t) => t.attempted), [false, true, true, true]);
  assert.equal(tiers[0].refusal?.stage, "tier");
  assert.equal(tiers[1].ok, true);
  assert.ok(tiers[1].pattern?.svg);
  for (const t of tiers.filter((x) => !x.ok)) { assert.equal(t.pattern, null); assert.ok(t.short); assert.ok(t.refusal); }
  const best = [...tiers].reverse().find((t) => t.ok)!;
  assert.equal(r.budget?.used, best.budget);
  assert.equal(r.ok, true);
});

test("an explicit budget keeps the single-run behaviour and returns no tiers", async () => {
  const r = await analyseViews([readFileSync("fixtures/snapping-turtle.jpg")], { budget: 6 });
  assert.equal(r.views[0].tiers, null);
  assert.equal(r.budget?.requested, 6);
});
