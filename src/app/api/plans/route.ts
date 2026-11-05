/**
 * /api/plans — fold plan persistence endpoints.
 *
 * GET  /api/plans        → { plans: PlanRow[] }
 * POST /api/plans        → { ok: true } (400 on bad input)
 *
 * Runs on the Node runtime so it has access to node:sqlite / the filesystem.
 * Image data must never be submitted here; only plan metadata and plan_json.
 */

export const runtime = "nodejs";

import type { NextRequest } from "next/server";
import { listPlans, savePlan } from "@/lib/db";

export async function GET(): Promise<Response> {
  try {
    const plans = listPlans();
    return Response.json({ plans });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("id" in body) ||
    !("plan_json" in body) ||
    typeof (body as Record<string, unknown>).id !== "string" ||
    typeof (body as Record<string, unknown>).plan_json !== "string"
  ) {
    return Response.json(
      { error: "Body must include string fields: id, plan_json" },
      { status: 400 },
    );
  }

  const b = body as Record<string, unknown>;

  try {
    savePlan({
      id: b.id as string,
      plan_json: b.plan_json as string,
      created_at:
        typeof b.created_at === "number" ? b.created_at : undefined,
      source_hash:
        typeof b.source_hash === "string" ? b.source_hash : null,
      step_count:
        typeof b.step_count === "number" ? b.step_count : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }

  return Response.json({ ok: true }, { status: 201 });
}
