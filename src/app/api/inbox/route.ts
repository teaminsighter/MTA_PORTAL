export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { desc, ne, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { leads as leadsTable, LEAD_STATES } from "@/db/schema";
import { auth } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo/mode";
import { demoListLeads } from "@/lib/demo/data";
import type { Lead, LeadState } from "@/lib/mock";

/*
 * GET /api/inbox — authenticated. Powers the inbox screen's live
 * polling and the shell sidebar's unread badge with one round-trip.
 *
 * Returns the top ~50 non-placeholder leads sorted by created_at, plus
 * per-state totals so the sidebar can badge without a separate call.
 * The client tracks a "last seen" timestamp locally (localStorage) and
 * computes unread as `created_at > lastSeenAt`.
 */

const RECENT_LIMIT = 50;

export type InboxResponse = {
  leads: Lead[];
  total: number;
  by_state: Record<LeadState, number>;
};

export async function GET() {
  // Demo mode: no auth, no DB. Return mock data so the polling
  // /api/inbox call from InboxClient + Sidebar succeeds without a
  // signed-in session.
  if (isDemoMode()) {
    const leads = demoListLeads();
    const by_state = Object.fromEntries(
      LEAD_STATES.map((s) => [s, 0])
    ) as Record<LeadState, number>;
    for (const l of leads) {
      if (l.state in by_state) by_state[l.state as LeadState] += 1;
    }
    return Response.json({
      leads,
      total: leads.length,
      by_state,
    } satisfies InboxResponse);
  }

  const session = await auth();
  if (!session?.user) {
    return Response.json({ error: "unauthenticated" }, { status: 401 });
  }

  const db = getDb();

  const [rows, stateRows] = await Promise.all([
    db
      .select()
      .from(leadsTable)
      .where(ne(leadsTable.source, "seed_placeholder"))
      .orderBy(desc(leadsTable.created_at))
      .limit(RECENT_LIMIT),
    db
      .select({
        state: leadsTable.state,
        count: sql<number>`count(*)`.as("count"),
      })
      .from(leadsTable)
      .where(ne(leadsTable.source, "seed_placeholder"))
      .groupBy(leadsTable.state),
  ]);

  const by_state = Object.fromEntries(
    LEAD_STATES.map((s) => [s, 0])
  ) as Record<LeadState, number>;
  for (const row of stateRows) {
    by_state[row.state as LeadState] = Number(row.count);
  }
  const total = Object.values(by_state).reduce((a, b) => a + b, 0);

  const leads: Lead[] = rows.map((r) => ({
    id: r.d1_lead_id,
    address: r.address_raw,
    vendor_name: r.vendor_name,
    phone: r.phone,
    email: r.email,
    state: r.state,
    source: r.source,
    created_at: r.created_at,
  }));

  return Response.json({ leads, total, by_state } satisfies InboxResponse);
}
