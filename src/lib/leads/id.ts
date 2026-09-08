import "server-only";

import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { id_counters } from "@/db/schema";
import type { Db } from "@/db/client";

/*
 * Next public lead reference in the shape MTA-YYYY-NNNNN.
 *
 * Uses a per-year counter row and D1's atomic
 *
 *   INSERT INTO id_counters (key, value)
 *        VALUES (?, 1)
 *   ON CONFLICT(key) DO UPDATE SET value = value + 1, updated_at = ?
 *   RETURNING value
 *
 * so two concurrent callers can't ever get the same NNNNN — the whole
 * increment-and-read is one statement, serialised by D1's writer.
 * No SELECT MAX race.
 *
 * The seed script initialises `lead_seq_YYYY` to the highest imported
 * NNNNN so freshly-ingested leads land above the historical range.
 */
export async function nextD1LeadId(
  now: Date = new Date(),
  db: Db = getDb()
): Promise<string> {
  const year = now.getUTCFullYear();
  const key = `lead_seq_${year}`;
  const nowIso = now.toISOString();

  const [row] = await db
    .insert(id_counters)
    .values({ key, value: 1, updated_at: nowIso })
    .onConflictDoUpdate({
      target: id_counters.key,
      set: {
        value: sql`${id_counters.value} + 1`,
        updated_at: nowIso,
      },
    })
    .returning({ value: id_counters.value });

  return `MTA-${year}-${String(row.value).padStart(5, "0")}`;
}
