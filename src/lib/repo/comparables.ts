import "server-only";

import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { property_comparables as compsTable } from "@/db/schema";
import { getLeadRowId } from "@/lib/repo/leads";
import { isDemoMode } from "@/lib/demo/mode";
import { demoListComparablesForLead } from "@/lib/demo/data";
import type { Comparable } from "@/lib/mock";

type Row = typeof compsTable.$inferSelect;

function toComparable(row: Row): Comparable {
  return {
    address: row.address,
    sale_price: row.sale_price,
    sale_date: row.sale_date,
    distance_m: row.distance_m,
    cv_at_sale: row.cv_at_sale,
    agent_name: row.agent_name_raw ?? "",
    agency: row.agency_raw ?? "",
  };
}

export async function listComparablesForLead(
  publicLeadId: string
): Promise<Comparable[]> {
  if (isDemoMode()) return demoListComparablesForLead(publicLeadId);
  const rowId = await getLeadRowId(publicLeadId);
  if (!rowId) return [];
  const rows = await getDb()
    .select()
    .from(compsTable)
    .where(eq(compsTable.lead_id, rowId))
    .orderBy(asc(compsTable.distance_m));
  return rows.map(toComparable);
}
