/**
 * Fold fixtures MCP server (stdio).
 *
 *   node mcp/fixtures-server.ts
 *
 * Exposes the reference photographs in fixtures/ as resources (with their licence notes from
 * fixtures/README.md) and two tools: list_fixtures and run_pipeline. run_pipeline calls
 * src/lib/pipeline.ts on a fixture by name and returns a summary. It writes no files.
 *
 * Transport: MCP stdio, newline-delimited JSON-RPC 2.0, implemented here directly. The official
 * SDK (@modelcontextprotocol/sdk) is not installed and no dependency was added. stdout carries
 * protocol messages only; anything else goes to stderr.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runPipeline, ImageDecodeError, DEFAULT_SOLVER_RELATIVE } from "../src/lib/pipeline.ts";
import { foldDistribution } from "../tools/cp-to-svg.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = join(ROOT, "fixtures");
const SERVER_INFO = { name: "fold-fixtures", version: "0.1.0" };
const SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];

// ---------- fixtures ----------

interface Fixture {
  name: string;
  mime: "image/png" | "image/jpeg";
  bytes: number;
  width: number | null;
  height: number | null;
  licence: string;
  caveat: boolean;
  note: string; // the fixtures/README.md section for this file
}

/** Width and height from the file header, without decoding the image. */
function dimensions(buf: Buffer): { width: number; height: number } | null {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  return null;
}

/** README sections keyed by the file name in the `## ` heading. */
function readmeSections(): Map<string, string> {
  const text = readFileSync(join(FIXTURES, "README.md"), "utf8");
  const out = new Map<string, string>();
  for (const part of text.split(/^## /m).slice(1)) {
    const nl = part.indexOf("\n");
    out.set(part.slice(0, nl).trim(), "## " + part.trimEnd() + "\n");
  }
  return out;
}

function licenceLine(section: string | undefined): string {
  if (!section) return "not stated in fixtures/README.md";
  // A bullet is its first line plus the indented lines that follow it.
  const lines = section.split("\n");
  const at = lines.findIndex((l) => l.startsWith("- Licence:"));
  if (at >= 0) {
    let end = at + 1;
    while (end < lines.length && /^\s{2,}\S/.test(lines[end])) end++;
    return lines.slice(at, end).map((l) => l.trim()).join(" ").replace(/^- /, "");
  }
  const d = section.match(/It is a derivative[\s\S]*?terms\./);
  return d ? d[0].replace(/\s*\n\s*/g, " ").trim() : "not stated in fixtures/README.md";
}

/** Read from disk on every call: the fixtures change while the repo is being worked on. */
function loadFixtures(): Fixture[] {
  const sections = readmeSections();
  return readdirSync(FIXTURES)
    .filter((f) => /\.(png|jpe?g)$/i.test(f))
    .sort()
    .map((name) => {
      const path = join(FIXTURES, name);
      const dim = dimensions(readFileSync(path));
      const section = sections.get(name);
      return {
        name,
        mime: /\.png$/i.test(name) ? "image/png" : "image/jpeg",
        bytes: statSync(path).size,
        width: dim?.width ?? null,
        height: dim?.height ?? null,
        licence: licenceLine(section),
        caveat: !!section && /\*\*Caveat/.test(section),
        note: section ?? `## ${name}\n\nNo section in fixtures/README.md.\n`,
      };
    });
}

function findFixture(name: unknown): Fixture {
  if (typeof name !== "string" || name === "") throw new ToolError("`image` must be a fixture file name");
  const f = loadFixtures().find((x) => x.name === name);
  if (!f) throw new ToolError(`no fixture named ${JSON.stringify(name)}; call list_fixtures`);
  return f;
}

// ---------- tools ----------

class ToolError extends Error {}

const TOOLS = [
  {
    name: "list_fixtures",
    description:
      "List the reference photographs in fixtures/: name, size in pixels, bytes, licence line and whether " +
      "the README attaches a caveat (for example a cut-out or AI-modified background).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "run_pipeline",
    description:
      "Run the Fold pipeline (src/lib/pipeline.ts: mask, skeleton, tree, solver, crease pattern, flat-fold check) " +
      "on a fixture by name and return a summary: leaves, minimum tier, cp status, vertex and crease counts, " +
      "fold distribution, warnings. Writes no files. Uses the pipeline defaults unless options are given.",
    inputSchema: {
      type: "object",
      properties: {
        image: { type: "string", description: "Fixture file name, as returned by list_fixtures, e.g. bush-dog.png" },
        options: {
          type: "object",
          description: "Pipeline options; all optional.",
          properties: {
            maxLeaves: { type: "integer", minimum: 1, maximum: 64, description: "Flap budget. Default 12." },
            maxDim: { type: "integer", minimum: 64, maximum: 2048, description: "Longer side after downscale. Default 512." },
            significance: { type: "number", minimum: 0, description: "Leaf significance threshold. Default 2.0." },
            spur: { type: "number", minimum: 0, description: "Pixel spur threshold. Default 0 (off)." },
            contract: { type: "number", minimum: 0, description: "Sub-minimum edge contraction threshold. Default 0.012; 0 disables." },
          },
          additionalProperties: false,
        },
      },
      required: ["image"],
      additionalProperties: false,
    },
  },
];

function optNum(o: Record<string, unknown>, key: string, lo: number, hi: number, int = false): number | undefined {
  const v = o[key];
  if (v === undefined) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi || (int && !Number.isInteger(v))) {
    throw new ToolError(`options.${key} must be ${int ? "an integer" : "a number"} from ${lo} to ${hi}`);
  }
  return v;
}

async function runPipelineTool(args: Record<string, unknown>) {
  const f = findFixture(args.image);
  const raw = args.options ?? {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new ToolError("`options` must be an object");
  const o = raw as Record<string, unknown>;
  const known = ["maxLeaves", "maxDim", "significance", "spur", "contract"];
  for (const k of Object.keys(o)) if (!known.includes(k)) throw new ToolError(`unknown option ${JSON.stringify(k)}`);

  const used = {
    maxLeaves: optNum(o, "maxLeaves", 1, 64, true) ?? 12,
    maxDim: optNum(o, "maxDim", 64, 2048, true) ?? 512,
    significance: optNum(o, "significance", 0, 1000),
    spur: optNum(o, "spur", 0, 100000),
    contract: optNum(o, "contract", 0, 1),
  };

  // No debugImages, and nothing below touches the file system for writing.
  const r = await runPipeline(readFileSync(join(FIXTURES, f.name)), {
    ...used,
    solverPath: process.env.FOLD_SOLVER || join(ROOT, DEFAULT_SOLVER_RELATIVE),
    label: f.name,
    name: f.name,
  });

  const warnings: string[] = [];
  if (r.fault) warnings.push(`fault: ${r.fault}`);
  if (r.refusal) warnings.push(`refusal (${r.refusal.stage}): ${r.refusal.message}${r.refusal.detail ? ` [${r.refusal.detail}]` : ""}`);
  for (const d of r.contraction?.dropped ?? []) {
    warnings.push(`leaf ${d.leaf} dropped by contraction: edge ${d.length.toFixed(4)} is too short to fold`);
  }
  if (r.solver?.cp_built && !r.assigned) warnings.push("crease pattern built but no mountain/valley assignment: not printable");
  if (r.solver?.error) warnings.push(`solver error: ${r.solver.error}`);
  for (const e of r.foldCheck?.errors ?? []) warnings.push(`FOLD error: ${e}`);
  for (const w of r.foldCheck?.warnings ?? []) warnings.push(`FOLD warning: ${w}`);
  if (r.foldFacesOmitted) warnings.push(`faces_vertices omitted: ${r.foldFacesOmitted}`);
  if (r.flatFold && r.flatFold.failEither > 0) {
    warnings.push(`${r.flatFold.failEither} of ${r.flatFold.interiorVertices} interior vertices are not locally flat-foldable`);
  }

  const cp = r.solver?.cp_built ? r.solver.cp : null;
  const ff = r.flatFold;
  const summary = {
    fixture: f.name,
    licence: f.licence,
    caveat: f.caveat ? "fixtures/README.md attaches a caveat to this fixture; read its resource before relying on it" : null,
    optionsUsed: used,
    ok: r.ok,
    image: r.image,
    coverage: r.coverage,
    leaves: r.tree?.leaves ?? null,
    nodes: r.tree?.nodes.length ?? null,
    minimumTier: r.minimum ? { tier: r.minimum.tier, requiredLeaves: r.minimum.requiredLeaves, reason: r.minimum.reason } : null,
    tiers: r.tiers,
    solver: r.solver
      ? { converged: r.solver.converged, feasible: r.solver.feasible, scale: r.solver.scale, cpStatus: r.solver.cp_status, cpBuilt: r.solver.cp_built }
      : null,
    cp: cp
      ? { vertices: cp.vertices.length, creases: cp.creases.length, foldDistribution: foldDistribution(cp), faces: r.fold?.faces_vertices?.length ?? null }
      : null,
    assigned: r.assigned,
    foldValid: r.foldCheck?.ok ?? null,
    flatFold: ff
      ? { interiorVertices: ff.interiorVertices, passBoth: ff.passBoth, failKawasaki: ff.failKawasaki, failMaekawa: ff.failMaekawa, maxResidualRad: ff.maxResidual }
      : null,
    warnings,
    totalMs: Math.round(r.totalMs),
  };
  return summary;
}

async function callTool(name: string, args: Record<string, unknown>) {
  if (name === "list_fixtures") {
    return loadFixtures().map(({ note: _note, ...rest }) => rest);
  }
  if (name === "run_pipeline") return runPipelineTool(args);
  throw new RpcError(-32602, `unknown tool ${JSON.stringify(name)}`);
}

// ---------- resources ----------

const NOTE_PREFIX = "fixture://";
const IMAGE_PREFIX = "fixture-image://";

function listResources() {
  const out = [];
  for (const f of loadFixtures()) {
    out.push({
      uri: NOTE_PREFIX + f.name,
      name: `${f.name} (licence note)`,
      description: `fixtures/README.md section for ${f.name}: source, author, licence, caveats.`,
      mimeType: "text/markdown",
    });
    out.push({
      uri: IMAGE_PREFIX + f.name,
      name: f.name,
      description: `${f.width}x${f.height}, ${f.bytes} bytes. ${f.licence}`,
      mimeType: f.mime,
      size: f.bytes,
    });
  }
  return out;
}

function readResource(uri: string) {
  const isNote = uri.startsWith(NOTE_PREFIX);
  const isImage = uri.startsWith(IMAGE_PREFIX);
  if (!isNote && !isImage) throw new RpcError(-32002, `resource not found: ${uri}`);
  const name = uri.slice((isNote ? NOTE_PREFIX : IMAGE_PREFIX).length);
  const f = loadFixtures().find((x) => x.name === name); // lookup by listing, never by path
  if (!f) throw new RpcError(-32002, `resource not found: ${uri}`);
  if (isNote) return { contents: [{ uri, mimeType: "text/markdown", text: f.note }] };
  return { contents: [{ uri, mimeType: f.mime, blob: readFileSync(join(FIXTURES, f.name)).toString("base64") }] };
}

// ---------- JSON-RPC ----------

class RpcError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

function send(msg: unknown) {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

async function handle(method: string, params: Record<string, unknown>): Promise<unknown> {
  switch (method) {
    case "initialize": {
      const asked = params.protocolVersion;
      return {
        protocolVersion: typeof asked === "string" && SUPPORTED_PROTOCOLS.includes(asked) ? asked : SUPPORTED_PROTOCOLS[0],
        capabilities: { tools: { listChanged: false }, resources: { subscribe: false, listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          "Reference photographs for Fold. list_fixtures, then run_pipeline on one by name to read its expected result. " +
          "Read the fixture's licence-note resource before relying on it: some are cut-outs.",
      };
    }
    case "ping":
      return {};
    case "tools/list":
      return { tools: TOOLS };
    case "tools/call": {
      const name = params.name;
      if (typeof name !== "string") throw new RpcError(-32602, "tools/call needs a tool name");
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      try {
        const result = await callTool(name, args);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError: false };
      } catch (e) {
        if (e instanceof RpcError) throw e;
        const text = e instanceof ToolError || e instanceof ImageDecodeError ? (e as Error).message : `internal error: ${(e as Error).message}`;
        return { content: [{ type: "text", text }], isError: true };
      }
    }
    case "resources/list":
      return { resources: listResources() };
    case "resources/templates/list":
      return { resourceTemplates: [] };
    case "resources/read":
      if (typeof params.uri !== "string") throw new RpcError(-32602, "resources/read needs a uri");
      return readResource(params.uri);
    default:
      throw new RpcError(-32601, `method not found: ${method}`);
  }
}

const rl = createInterface({ input: process.stdin });
const pending = new Set<Promise<void>>();

rl.on("line", (line) => {
  if (!line.trim()) return;
  let msg: { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
  try {
    msg = JSON.parse(line);
  } catch {
    send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
    return;
  }
  if (typeof msg.method !== "string") return; // a response to a request we never send
  const isRequest = msg.id !== undefined && msg.id !== null;
  const p = handle(msg.method, msg.params ?? {}).then(
    (result) => {
      if (isRequest) send({ jsonrpc: "2.0", id: msg.id, result });
    },
    (e) => {
      if (!isRequest) return; // notifications get no reply
      const code = e instanceof RpcError ? e.code : -32603;
      send({ jsonrpc: "2.0", id: msg.id, error: { code, message: (e as Error).message } });
    },
  );
  pending.add(p);
  p.finally(() => pending.delete(p));
});

// On stdin close, finish in-flight calls before exiting.
rl.on("close", () => {
  Promise.all(pending).finally(() => process.exit(0));
});
