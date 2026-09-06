import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { agents as agentsTable, lead_agent_picks } from "@/db/schema";
import { getLeadRowId } from "@/lib/repo/leads";
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
    version: row.version,
  };
}

/*
 * Represents an agent as seen from a lead's workspace: the agent record
 * plus the lead-scoped pick row if one exists. Pick carries its own
 * version so the AgentRow can save reason_note via saveReasonNoteAction
 * with the correct optimistic-concurrency guard.
 */
export interface PickInfo {
  reasonNote: string;
  version: number;
}
export interface ShortlistEntry {
  agent: Agent;
  pick: PickInfo | null;
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
 * Phase 1 shortlist: top signed/verbal agents by nearby_sales, LEFT JOIN
 * the lead's pick rows so the workspace can pre-fill each reason
 * textarea and pass through the pick version. Phase 5 will replace the
 * shortlist logic with real name-matching over comparables.
 */
export async function getShortlistForLead(
  publicLeadId: string
): Promise<ShortlistEntry[]> {
  const leadRowId = await getLeadRowId(publicLeadId);
  const db = getDb();

  const query = db
    .select({
      agent: agentsTable,
      pickReason: lead_agent_picks.reason_note,
      pickVersion: lead_agent_picks.version,
      pickUnpickedAt: lead_agent_picks.unpicked_at,
    })
    .from(agentsTable)
    .where(
      and(
        eq(agentsTable.active, true),
        inArray(agentsTable.membership_status, ["signed", "verbally_agreed"])
      )
    )
    .orderBy(desc(agentsTable.nearby_sales))
    .limit(6);

  const rows = leadRowId
    ? await query.leftJoin(
        lead_agent_picks,
        and(
          eq(lead_agent_picks.agent_id, agentsTable.id),
          eq(lead_agent_picks.lead_id, leadRowId)
        )
      )
    : await query;

  return rows.map<ShortlistEntry>((r) => ({
    agent: toAgent(r.agent),
    // Treat an unpicked (soft-deleted) pick row as no pick — the reason
    // is stale until the user re-picks.
    pick:
      r.pickVersion !== null &&
      r.pickVersion !== undefined &&
      !r.pickUnpickedAt
        ? { reasonNote: r.pickReason ?? "", version: r.pickVersion }
        : null,
  }));
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
