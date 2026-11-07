/**
 * Report the candidates found in one or more images (task 3.11).
 *
 *   node tools/candidates.ts <image.jpg|png> [...more]
 *
 * Prints the segmentation path, the colour clusters if the fallback ran, and one row per candidate.
 * Writes nothing.
 */
import { readFileSync } from "node:fs";
import { analyseImage } from "../src/lib/segment.ts";

for (const file of process.argv.slice(2)) {
  const t = performance.now();
  const a = await analyseImage(readFileSync(file), { label: file });
  console.log(`\n== ${file}  (${((performance.now() - t) / 1000).toFixed(1)} s)`);
  const s = a.segmentation;
  console.log(
    `path ${s.path}; primary candidates ${s.primaryCandidates}, rectangularity ${s.primaryRectangularity.toFixed(3)}; ` +
      `fallback: ${s.fallbackReason ?? "not run"}`,
  );
  if (s.clusters) {
    console.log("clusters  #  mean rgb          area   border  role");
    for (const c of s.clusters) {
      console.log(
        `          ${c.index}  ${c.mean.map((v) => String(Math.round(v)).padStart(3)).join(",")}   ` +
          `${(c.areaShare * 100).toFixed(1).padStart(5)}%  ${(c.borderShare * 100).toFixed(1).padStart(5)}%  ${c.background ? "background" : "candidate source"}`,
      );
    }
  }
  console.log(`candidates ${a.candidates.length}; top-level ok=${a.ok}`);
  const row = (c: (typeof a.candidates)[number]) =>
    console.log(
      `  #${c.index} ${c.path}  bbox ${c.bbox.x},${c.bbox.y} ${c.bbox.width}x${c.bbox.height}  area ${(c.areaShare * 100).toFixed(1)}%  ` +
        `leaves ${c.leaves ?? "-"}  tier ${c.tier ?? "-"}  ok ${c.ok}  pattern ${c.patternBuilt}` +
        (c.refusal ? `  REFUSED[${c.refusal.stage}] ${c.refusal.detail ?? c.refusal.message}` : ""),
    );
  a.candidates.forEach(row);
  if (s.fallbackCandidates) {
    console.log(`fallback found ${s.fallbackCandidates.length} (used: ${s.path === "colour"})`);
    s.fallbackCandidates.forEach(row);
  }
}
