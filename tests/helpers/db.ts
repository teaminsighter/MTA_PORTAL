import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import * as schema from "@/db/schema";

/*
 * Fresh in-memory SQLite with every drizzle migration applied, wired
 * to a drizzle client. The returned client has the identical API surface
 * as the production D1 client (getDb) so tests can vi.mock('@/db/client')
 * and return this without touching call sites.
 *
 * Applying real migration SQL (not a schema push) means the tests
 * catch anything drizzle-kit emits differently from what the schema
 * source predicts — CHECK constraints, defaults, unique indexes.
 */
export function createTestDb() {
  const raw = new Database(":memory:");
  raw.pragma("foreign_keys = ON");

  const migrationsDir = resolve(process.cwd(), "drizzle");
  const files = readdirSync(migrationsDir)
    .filter((f) => /^\d{4,}_.+\.sql$/.test(f))
    .sort();

  for (const file of files) {
    const sqlText = readFileSync(resolve(migrationsDir, file), "utf8");
    // Drizzle emits `--> statement-breakpoint` between statements.
    // better-sqlite3 needs them applied one at a time so we split.
    const statements = sqlText
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of statements) {
      raw.exec(stmt);
    }
  }

  return drizzle(raw, { schema });
}

export type TestDb = ReturnType<typeof createTestDb>;
