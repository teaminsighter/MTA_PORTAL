import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { agent_candidates as candidatesTable } from "@/db/schema";
import { getLeadRowId } from "@/lib/repo/leads";
import { isDemoMode } from "@/lib/demo/mode";
import { demoListCandidatesForLead } from "@/lib/demo/data";
import type { AgentCandidate } from "@/lib/mock";

type Row = typeof candidatesTable.$inferSelect;

function toCandidate(row: Row): AgentCandidate {
  return {
    id: row.id,
    name: row.name_raw,
    agency: row.agency,
    phone: row.phone,
    email: row.email,
    first_seen_lead_id: row.first_seen_lead_id ?? "",
    confidence: row.confidence,
    reason_hint: row.reason_hint ?? "",
  };
}

/*
 * Candidates the workspace should show: rows tied to this lead whose
 * status is still worth a decision. `promoted` and `dismissed` are
 * terminal — a promoted candidate is now an Agent shown in the
 * shortlist; a dismissed one deliberately doesn't come back.
 */
export async function listCandidatesForLead(
  publicLeadId: string
): Promise<AgentCandidate[]> {
  if (isDemoMode()) return demoListCandidatesForLead(publicLeadId);
  const rowId = await getLeadRowId(publicLeadId);
  if (!rowId) return [];
  const rows = await getDb()
    .select()
    .from(candidatesTable)
    .where(
      and(
        eq(candidatesTable.first_seen_lead_id, rowId),
        inArray(candidatesTable.status, ["new", "contacted"])
      )
    );
  return rows.map(toCandidate);
}
