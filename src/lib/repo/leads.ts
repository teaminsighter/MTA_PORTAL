import "server-only";

import { desc, eq, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { leads as leadsTable } from "@/db/schema";
import { isDemoMode } from "@/lib/demo/mode";
import {
  demoGetLead,
  demoListLeads,
  demoListRecentLeads,
} from "@/lib/demo/data";
import type { Lead } from "@/lib/mock";

/*
 * `seed_placeholder` leads are synthesised by the local seed script to
 * anchor historical outcome rows to a valid FK. They aren't real work
 * and shouldn't show in the inbox / admin lists by default. Callers
 * can opt in with { includePlaceholders: true }.
 */
interface ListOpts {
  includePlaceholders?: boolean;
}

/* Row → UI type. Kept close to the queries so any schema drift breaks here. */
function toLead(row: typeof leadsTable.$inferSelect): Lead {
  return {
    id: row.d1_lead_id,
    address: row.address_raw,
    vendor_name: row.vendor_name,
    phone: row.phone,
    email: row.email,
    state: row.state,
    source: row.source,
    created_at: row.created_at,
    version: row.version,
  };
}

/** Public → internal id + row version, no full-row read. */
export async function getLeadRow(publicId: string): Promise<
  | {
      id: string;
      state: import("@/lib/leads/state").DbLeadState;
      version: number;
    }
  | null
> {
  if (isDemoMode()) return null; // auto-advance skipped in demo
  const [row] = await getDb()
    .select({
      id: leadsTable.id,
      state: leadsTable.state,
      version: leadsTable.version,
    })
    .from(leadsTable)
    .where(eq(leadsTable.d1_lead_id, publicId))
    .limit(1);
  return row ?? null;
}

export async function listLeads(opts: ListOpts = {}): Promise<Lead[]> {
  if (isDemoMode()) return demoListLeads();
  const q = getDb().select().from(leadsTable);
  const rows = opts.includePlaceholders
    ? await q.orderBy(desc(leadsTable.created_at))
    : await q
        .where(ne(leadsTable.source, "seed_placeholder"))
        .orderBy(desc(leadsTable.created_at));
  return rows.map(toLead);
}

export async function getLead(publicId: string): Promise<Lead | null> {
  if (isDemoMode()) return demoGetLead(publicId);
  const [row] = await getDb()
    .select()
    .from(leadsTable)
    .where(eq(leadsTable.d1_lead_id, publicId))
    .limit(1);
  return row ? toLead(row) : null;
}

/** Internal helper used by other repos that need the numeric `id`. */
export async function getLeadRowId(publicId: string): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(eq(leadsTable.d1_lead_id, publicId))
    .limit(1);
  return row?.id ?? null;
}

export async function listRecentLeads(
  limit = 6,
  opts: ListOpts = {}
): Promise<Lead[]> {
  if (isDemoMode()) return demoListRecentLeads(limit);
  const q = getDb().select().from(leadsTable);
  const rows = opts.includePlaceholders
    ? await q.orderBy(desc(leadsTable.created_at)).limit(limit)
    : await q
        .where(ne(leadsTable.source, "seed_placeholder"))
        .orderBy(desc(leadsTable.created_at))
        .limit(limit);
  return rows.map(toLead);
}
