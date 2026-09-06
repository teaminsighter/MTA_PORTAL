import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { agent_candidates as candidatesTable } from "@/db/schema";
import { getLeadRowId } from "@/lib/repo/leads";
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

export async function listCandidatesForLead(
  publicLeadId: string
): Promise<AgentCandidate[]> {
  const rowId = await getLeadRowId(publicLeadId);
  if (!rowId) return [];
  const rows = await getDb()
    .select()
    .from(candidatesTable)
    .where(eq(candidatesTable.first_seen_lead_id, rowId));
  return rows.map(toCandidate);
}
