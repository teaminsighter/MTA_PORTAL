import "server-only";

import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { leads as leadsTable } from "@/db/schema";
import type { Lead } from "@/lib/mock";

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
  };
}

export async function listLeads(): Promise<Lead[]> {
  const rows = await getDb()
    .select()
    .from(leadsTable)
    .orderBy(desc(leadsTable.created_at));
  return rows.map(toLead);
}

export async function getLead(publicId: string): Promise<Lead | null> {
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

export async function listRecentLeads(limit = 6): Promise<Lead[]> {
  const rows = await getDb()
    .select()
    .from(leadsTable)
    .orderBy(desc(leadsTable.created_at))
    .limit(limit);
  return rows.map(toLead);
}
