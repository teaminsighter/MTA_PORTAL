import "server-only";

import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { leads } from "@/db/schema";
import { logAudit } from "@/lib/audit";
import type { LeadState } from "@/lib/mock";

/*
 * `empty_workspace` is a UI-only fake state for the demo empty screen
 * and never lives in the leads table. The DB column's typed union
 * excludes it, so the state helper narrows LeadState here.
 */
export type DbLeadState = Exclude<LeadState, "empty_workspace">;

/*
 * Lead state machine — PLAN §9 in one place.
 *
 * Every transition of `leads.state` in the codebase should go through
 * transitionLead(). It:
 *   - Checks the transition is in the allowed-next set
 *   - Runs a race-safe UPDATE (id + state + version guard)
 *   - Bumps version
 *   - Writes an audit_log row action='lead.state_transition' with
 *     before/after state and version snapshots
 *
 * The dispatcher (Phase 6) will own transitions FROM `dispatching`;
 * user-facing actions own everything else.
 *
 * Not yet in the enum:
 *   - `replacement_required` (swap flow, §6) — will be added when
 *     Phase 6 lands. The current TRANSITIONS map is annotated so we
 *     remember to open the edge into `awaiting_agent_responses`.
 */

export const TRANSITIONS: Record<LeadState, readonly LeadState[]> = {
  empty_workspace: [],
  received: ["enriching"],
  enriching: ["ready_for_review"],
  ready_for_review: ["dispatching"],
  dispatching: ["sent", "partial_send"],
  partial_send: ["ready_for_review"],
  sent: ["awaiting_agent_responses"],
  // TODO(phase-6): add "replacement_required" once it lives in
  // LEAD_STATES + the leads_state_check migration.
  awaiting_agent_responses: ["agent_appointed"],
  agent_appointed: ["listed"],
  listed: ["sold"],
  sold: [],
};

export function canTransition(from: LeadState, to: LeadState): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/*
 * Optional per-transition role gate. Empty array = internal-only —
 * callable from server code (dispatcher, cron) but never from a
 * user-triggered path. Enforcement is at the caller; transitionLead
 * itself is the atomic DB write.
 */
export const TRANSITION_ROLES: Partial<
  Record<`${DbLeadState}->${DbLeadState}`, readonly ("consultant" | "admin")[]>
> = {
  "received->enriching": ["consultant", "admin"],
  "enriching->ready_for_review": ["consultant", "admin"],
  "ready_for_review->dispatching": ["consultant", "admin"],
  "dispatching->sent": [], // dispatcher only
  "dispatching->partial_send": [], // dispatcher only
  "partial_send->ready_for_review": ["admin"],
  "sent->awaiting_agent_responses": [], // system on Send completion
  "awaiting_agent_responses->agent_appointed": ["consultant", "admin"],
  "agent_appointed->listed": ["consultant", "admin"],
  "listed->sold": ["consultant", "admin"],
};

export type TransitionResult =
  | { ok: true; state: DbLeadState; version: number }
  | { ok: false; code: "not_allowed"; from: DbLeadState; to: DbLeadState }
  | { ok: false; code: "not_found" }
  | {
      ok: false;
      code: "version_conflict";
      latest: { state: DbLeadState; version: number };
    };

/**
 * Race-safe move of leads.state, gated on both (state = from) AND
 * (version = expectedVersion). Zero rows affected → we look up the
 * current row and report `version_conflict` with the truth.
 */
export async function transitionLead(params: {
  leadRowId: string;
  from: DbLeadState;
  to: DbLeadState;
  expectedVersion: number;
  actorUserId: string | null;
  reason?: string;
}): Promise<TransitionResult> {
  if (!canTransition(params.from, params.to)) {
    return {
      ok: false,
      code: "not_allowed",
      from: params.from,
      to: params.to,
    };
  }

  const db = getDb();
  const now = new Date().toISOString();

  const result = await db
    .update(leads)
    .set({
      state: params.to,
      updated_at: now,
      version: sql`${leads.version} + 1`,
    })
    .where(
      and(
        eq(leads.id, params.leadRowId),
        eq(leads.state, params.from),
        eq(leads.version, params.expectedVersion)
      )
    )
    .returning({ state: leads.state, version: leads.version });

  if (result.length === 0) {
    const [row] = await db
      .select({ state: leads.state, version: leads.version })
      .from(leads)
      .where(eq(leads.id, params.leadRowId))
      .limit(1);
    if (!row) return { ok: false, code: "not_found" };
    return {
      ok: false,
      code: "version_conflict",
      latest: { state: row.state, version: row.version },
    };
  }

  await logAudit({
    action: "lead.state_transition",
    actor_user_id: params.actorUserId,
    entity_type: "lead",
    entity_id: params.leadRowId,
    lead_id: params.leadRowId,
    before: { state: params.from, version: params.expectedVersion },
    after: {
      state: result[0].state,
      version: result[0].version,
      reason: params.reason ?? null,
    },
  });

  return {
    ok: true,
    state: result[0].state,
    version: result[0].version,
  };
}
