import "server-only";

import { desc, like } from "drizzle-orm";
import { getDb } from "@/db/client";
import { leads } from "@/db/schema";

/*
 * Next public lead reference in the shape MTA-YYYY-NNNNN.
 *
 * NNNNN is per-year, zero-padded, and monotonically increases within
 * the current UTC year. We scan for the current max in this year's
 * namespace and add one; the unique index on leads.d1_lead_id catches
 * concurrent collisions, and the caller (route handler) retries once.
 *
 * Historical seed_placeholder rows sit in the same namespace so real
 * new leads land after the largest existing number — that's fine,
 * placeholders occupy the space they were imported into.
 */
export async function nextD1LeadId(now = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const prefix = `MTA-${year}-`;
  const [row] = await getDb()
    .select({ id: leads.d1_lead_id })
    .from(leads)
    .where(like(leads.d1_lead_id, `${prefix}%`))
    .orderBy(desc(leads.d1_lead_id))
    .limit(1);
  const next = row
    ? parseInt(row.id.slice(prefix.length), 10) + 1
    : 1;
  return `${prefix}${String(next).padStart(5, "0")}`;
}
