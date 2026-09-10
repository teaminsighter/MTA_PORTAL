import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { lead_outcomes as outcomesTable, leads as leadsTable } from "@/db/schema";
import { isDemoMode } from "@/lib/demo/mode";
import { demoListRecentOutcomes } from "@/lib/demo/data";
import type { Outcome } from "@/lib/mock";

export async function listRecentOutcomes(limit = 12): Promise<Outcome[]> {
  if (isDemoMode()) return demoListRecentOutcomes(limit);
  // Join to leads to project the public d1_lead_id, not the internal row id.
  const rows = await getDb()
    .select({
      lead_public_id: leadsTable.d1_lead_id,
      outcome: outcomesTable.outcome,
      winning_agent_name: outcomesTable.winning_agent_name,
      sale_price: outcomesTable.sale_price,
      referral_amount: outcomesTable.referral_amount,
      recorded_at: outcomesTable.recorded_at,
    })
    .from(outcomesTable)
    .innerJoin(leadsTable, eq(leadsTable.id, outcomesTable.lead_id))
    .orderBy(desc(outcomesTable.recorded_at))
    .limit(limit);

  return rows.map<Outcome>((r) => ({
    lead_id: r.lead_public_id,
    outcome: r.outcome,
    winning_agent: r.winning_agent_name,
    sale_price: r.sale_price,
    referral_amount: r.referral_amount,
    recorded_at: r.recorded_at,
  }));
}
