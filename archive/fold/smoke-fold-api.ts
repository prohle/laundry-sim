/**
 * Smoke test for POST /api/fold against a running server.
 *
 *   node tools/smoke-fold-api.ts [http://localhost:3000]
 *
 * Sends fixtures/bush-dog.png (expect 200, ok:true), a text file (expect 415), and an
 * oversized body typed as PNG (expect 413). Prints the status and the JSON fields it checks.
 * Exit 0 only if every expectation holds. The 500 case needs a server started with a bad
 * FOLD_SOLVER; pass --expect-500 to send the dog and expect that instead.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = process.argv.slice(2).find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const expect500 = process.argv.includes("--expect-500");
const url = `${base}/api/fold`;
let failed = 0;

async function post(label: string, body: BodyInit, type: string, want: number, check?: (j: any) => string[]) {
  const t = performance.now();
  const res = await fetch(url, { method: "POST", headers: type ? { "Content-Type": type } : {}, body });
  const j: any = await res.json().catch(() => null);
  const problems: string[] = [];
  if (res.status !== want) problems.push(`status ${res.status}, wanted ${want}`);
  if (check && j) problems.push(...check(j));
  console.log(`${problems.length ? "FAIL" : "ok  "} ${label}: ${res.status} in ${((performance.now() - t) / 1000).toFixed(2)} s`);
  console.log(`     fields: ${j ? Object.keys(j).join(", ") : "(not JSON)"}`);
  if (j && res.status === 200) {
    console.log(
      `     ok=${j.ok} refusal=${JSON.stringify(j.refusal)} minimumTier=${j.minimumTier?.tier} ` +
        `leaves=${j.tree?.leaves} nodes=${j.tree?.nodes?.length} solver.cpStatus=${j.solver?.cpStatus} ` +
        `pattern=${j.pattern ? `cp ${j.pattern.cp.vertices.length}v/${j.pattern.cp.creases.length}c, foldValid=${j.pattern.foldValid}` : "null"}`,
    );
  } else if (j) {
    console.log(`     body: ${JSON.stringify(j)}`);
  }
  for (const p of problems) console.log(`     problem: ${p}`);
  if (problems.length) failed++;
}

const dog = readFileSync(join(ROOT, "fixtures/bush-dog.png"));
if (expect500) {
  await post("bush-dog.png, solver unavailable", dog, "image/png", 500, (j) => (j.error === "solver_unavailable" ? [] : [`error ${j.error}`]));
} else {
  await post("bush-dog.png", dog, "image/png", 200, (j) => {
    const p: string[] = [];
    if (j.ok !== true) p.push(`ok is ${j.ok}`);
    if (j.minimumTier?.tier !== "medium") p.push(`minimumTier ${j.minimumTier?.tier}, wanted medium`);
    if (!j.pattern?.cp) p.push("no pattern.cp");
    if (JSON.stringify(j).length > 5_000_000) p.push("response is suspiciously large");
    return p;
  });
  // Task 3.4: the dog's own tree posted back as multipart must give the same crease count.
  const first: any = await (await fetch(url, { method: "POST", headers: { "Content-Type": "image/png" }, body: dog })).json();
  const form = (tree: unknown) => {
    const f = new FormData();
    f.append("image", new Blob([dog], { type: "image/png" }), "bush-dog.png");
    f.append("tree", typeof tree === "string" ? tree : JSON.stringify(tree));
    return f;
  };
  const wantCreases = first.pattern?.cp?.creases?.length;
  await post("bush-dog.png + its own tree (multipart)", form(first.tree), "", 200, (j) => {
    const p: string[] = [];
    if (j.pattern?.cp?.creases?.length !== wantCreases) p.push(`creases ${j.pattern?.cp?.creases?.length}, wanted ${wantCreases}`);
    if (j.ok !== true) p.push(`ok is ${j.ok}`);
    return p;
  });
  const broken = (mutate: (t: any) => void) => { const t = structuredClone(first.tree); mutate(t); return form(t); };
  await post("edited tree with a cycle", broken((t) => t.edges.push({ from: t.edges[0].from, to: t.edges.at(-1).to, length: 0.1 })), "", 400);
  await post("edited tree outside [0,1]", broken((t) => { t.nodes[0].x = 1.5; }), "", 400, (j) => (j.error === "invalid_tree" ? [] : [`error ${j.error}`]));
  await post("edited tree, zero length", broken((t) => { t.edges[0].length = 0; }), "", 400);
  await post("edited tree, not JSON", form("{not json"), "", 400);
  await post("text file", "this is not an image\n", "text/plain", 415);
  await post("text file typed as png", "this is not an image\n", "image/png", 415);
  await post("11 MiB typed as png", new Uint8Array(11 * 1024 * 1024), "image/png", 413);
}
process.exit(failed ? 1 : 0);
