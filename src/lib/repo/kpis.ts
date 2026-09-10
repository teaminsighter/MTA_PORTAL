import "server-only";

import { and, eq, gte, ne, sum } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  dispatch_jobs,
  lead_outcomes,
  leads as leadsTable,
  sync_conflicts,
} from "@/db/schema";
import { isDemoMode } from "@/lib/demo/mode";
import { demoComputeKpis } from "@/lib/demo/data";
import type { Kpis } from "@/lib/mock";

/*
 * Phase 1 KPIs are the ones we can compute from the four seeded tables.
 * The rest (avg_time_to_send, agent_acceptance_pct) return sensible
 * placeholders because they need dispatch + notification data that lands
 * in Phase 5/6. The UI shape is unchanged.
 */
export async function computeKpis(): Promise<Kpis> {
  if (isDemoMode()) return demoComputeKpis();
  const db = getDb();

  const startOfMonth = new Date();
  startOfMonth.setUTCDate(1);
  startOfMonth.setUTCHours(0, 0, 0, 0);
  const startIso = startOfMonth.toISOString();

  const [leadsThisMonth, pendingPartial, syncConflictRows, referralSum] =
    await Promise.all([
      db
        .select({ id: leadsTable.id })
        .from(leadsTable)
        .where(
          and(
            gte(leadsTable.created_at, startIso),
            ne(leadsTable.source, "seed_placeholder")
          )
        ),
      db
        .select({ id: dispatch_jobs.id })
        .from(dispatch_jobs)
        .where(eq(dispatch_jobs.status, "partial_send")),
      db.select({ id: sync_conflicts.id }).from(sync_conflicts),
      db
        .select({ total: sum(lead_outcomes.referral_amount) })
        .from(lead_outcomes)
        .where(
          and(
            gte(lead_outcomes.recorded_at, startIso),
            eq(lead_outcomes.outcome, "referral_paid")
          )
        ),
    ]);

  return {
    leads_this_month: leadsThisMonth.length,
    avg_time_to_send_min: 0, // computed in Phase 6 once dispatch runs
    agent_acceptance_pct: 0, // computed in Phase 5/6
    pending_partial_sends: pendingPartial.length,
    sync_conflicts: syncConflictRows.length,
    canary_status: "green",
    referral_revenue_mtd: Number(referralSum[0]?.total ?? 0),
  };
}
