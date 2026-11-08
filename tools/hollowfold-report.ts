// Hollow mode (R9.6): run the four-silhouette sample, fold the net, print the closure gap and rigidity at several t.
import { readFileSync } from "node:fs";
import { runHollow } from "../src/lib/hollow.ts";
import { netFoldFrame, measureNetFold } from "../src/lib/netfold.ts";

const dir = "fixtures/hollow-sample";
const photos = ["front", "right", "back", "left"].map((n) => new Uint8Array(readFileSync(`${dir}/${n}.png`)));
const r = runHollow(photos, 0);
if (!r.ok || !r.fold) { console.log("REFUSED", r.refusal); process.exit(1); }
console.log(`faces=${r.faces} tabs=${r.tabs} dropped=${r.tabsDropped} flip=${r.fold.flip} cuts=${r.fold.cuts.length} closureGapMm(t=1)=${r.closureGapMm}`);
for (const t of [0, 0.25, 0.5, 0.75, 1]) {
  const m = measureNetFold(r.fold, netFoldFrame(r.fold, t));
  console.log(`t=${t} bbox=${m.bbox.map((v) => v.toFixed(2)).join(" x ")} mm gap=${m.closureGapMm.toExponential(2)} split=${m.maxVertexSplitMm.toExponential(2)} ortho=${m.maxOrthonormalityError.toExponential(2)} det=${m.maxDeterminantError.toExponential(2)} stretch=${m.maxEdgeStretchMm.toExponential(2)}`);
}
