import "server-only";

import { transitionLead, type DbLeadState } from "@/lib/leads/state";

/*
 * "Received → ready_for_review" auto-advance.
 *
 * Manual mode heuristic: a lead is ready for Sarah to review the
 * moment we know (a) the property has at least a CV and (b) she has
 * ticked at least one agent. We walk through the state machine
 * cleanly — received → enriching → ready_for_review — so the audit
 * trail reads like both steps happened (they did, we just did them
 * as a pair). Enrichment adapters (Phase 4b/Cotality) will replace
 * the manual step in-between later, but the transition sequence
 * stays the same.
 *
 * Idempotent: no-op if the lead isn't in `received`, or if either
 * condition isn't met, or if a concurrent request already moved it.
 */
export async function autoAdvanceIfReady(params: {
  leadRowId: string;
  currentState: DbLeadState;
  currentVersion: number;
  hasCv: boolean;
  hasPickedAgent: boolean;
  actorUserId: string | null;
}): Promise<{ advanced: boolean; finalState: DbLeadState }> {
  if (params.currentState !== "received") {
    return { advanced: false, finalState: params.currentState };
  }
  if (!params.hasCv || !params.hasPickedAgent) {
    return { advanced: false, finalState: params.currentState };
  }

  const t1 = await transitionLead({
    leadRowId: params.leadRowId,
    from: "received",
    to: "enriching",
    expectedVersion: params.currentVersion,
    actorUserId: params.actorUserId,
    reason: "auto: cv present + at least one pick",
  });
  if (!t1.ok) {
    // Another request beat us to it. Not our problem.
    return { advanced: false, finalState: params.currentState };
  }

  const t2 = await transitionLead({
    leadRowId: params.leadRowId,
    from: "enriching",
    to: "ready_for_review",
    expectedVersion: t1.version,
    actorUserId: params.actorUserId,
    reason: "auto: cv present + at least one pick",
  });
  if (!t2.ok) {
    // We nudged received → enriching but couldn't complete. Leave the
    // lead at enriching; the next reload retries.
    return { advanced: true, finalState: "enriching" };
  }

  return { advanced: true, finalState: "ready_for_review" };
}
