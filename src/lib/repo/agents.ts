import "server-only";

import { and, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "@/db/client";
import { agents as agentsTable } from "@/db/schema";
import type { Agent } from "@/lib/mock";

type Row = typeof agentsTable.$inferSelect;

function toAgent(row: Row): Agent {
  return {
    id: row.id,
    name: row.name,
    agency: row.agency,
    phone: row.phone,
    email: row.email,
    membership_status: row.membership_status,
    sms_permission: row.sms_permission,
    sales_last_12mo: row.sales_last_12mo,
    avg_days_on_market: row.avg_days_on_market,
    nearby_sales: row.nearby_sales,
    reason_hint: row.reason_hint ?? "",
  };
}

export async function listAgents(): Promise<Agent[]> {
  const rows = await getDb()
    .select()
    .from(agentsTable)
    .where(eq(agentsTable.active, true))
    .orderBy(desc(agentsTable.sales_last_12mo));
  return rows.map(toAgent);
}

/*
 * Phase 1 shortlist: top signed/verbal agents by nearby_sales.
 * Phase 5 will replace this with real name-matching over comparables.
 */
export async function getShortlistForLead(_publicLeadId: string): Promise<Agent[]> {
  const rows = await getDb()
    .select()
    .from(agentsTable)
    .where(
      and(
        eq(agentsTable.active, true),
        inArray(agentsTable.membership_status, ["signed", "verbally_agreed"])
      )
    )
    .orderBy(desc(agentsTable.nearby_sales))
    .limit(6);
  return rows.map(toAgent);
}

export async function countSignedAgents(): Promise<number> {
  const rows = await getDb()
    .select({ id: agentsTable.id })
    .from(agentsTable)
    .where(
      and(
        eq(agentsTable.active, true),
        eq(agentsTable.membership_status, "signed")
      )
    );
  return rows.length;
}
