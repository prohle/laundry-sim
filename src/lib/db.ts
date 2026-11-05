/**
 * SQLite persistence for fold plans.
 *
 * Uses Node 24's built-in node:sqlite (DatabaseSync) — no native builds needed.
 * The database file lives at ./data/fold.db, relative to the project root.
 * Image data is never stored here; only metadata and the serialised plan JSON.
 */

import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlanRow {
  id: string;
  created_at: number;
  source_hash: string | null;
  step_count: number | null;
  plan_json: string;
}

export interface SavePlanInput {
  id: string;
  /** Unix timestamp (seconds). Defaults to now if omitted. */
  created_at?: number;
  /** SHA-256 hex of the source image, if available. */
  source_hash?: string | null;
  step_count?: number | null;
  plan_json: string;
}

// ---------------------------------------------------------------------------
// Singleton database connection
// ---------------------------------------------------------------------------

function openDatabase(): DatabaseSync {
  const dbDir = path.join(process.cwd(), "data");
  fs.mkdirSync(dbDir, { recursive: true });

  const dbPath = path.join(dbDir, "fold.db");
  const db = new DatabaseSync(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS plans (
      id          TEXT    PRIMARY KEY,
      created_at  INTEGER NOT NULL,
      source_hash TEXT,
      step_count  INTEGER,
      plan_json   TEXT    NOT NULL
    ) STRICT;
  `);

  return db;
}

// Lazily initialised — safe to import at module level without side-effects
// at require time; the DB only opens when a function is actually called.
let _db: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (!_db) {
    _db = openDatabase();
  }
  return _db;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist a fold plan. Uses INSERT OR REPLACE so re-submitting the same id
 * is idempotent.
 */
export function savePlan(input: SavePlanInput): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO plans (id, created_at, source_hash, step_count, plan_json)
    VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(
    input.id,
    input.created_at ?? Math.floor(Date.now() / 1000),
    input.source_hash ?? null,
    input.step_count ?? null,
    input.plan_json,
  );
}

/**
 * Return all plans ordered newest-first.
 * Returns plain row objects; callers parse plan_json themselves.
 */
export function listPlans(): PlanRow[] {
  const db = getDb();
  const stmt = db.prepare(
    "SELECT id, created_at, source_hash, step_count, plan_json FROM plans ORDER BY created_at DESC",
  );
  return stmt.all() as unknown as PlanRow[];
}
