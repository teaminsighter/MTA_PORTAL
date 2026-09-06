import "server-only";

import { getDb } from "@/db/client";
import { audit_log } from "@/db/schema";

/*
 * Central audit sink. Every write scoped by §4:
 *   auth events, role changes, agent + candidate create/edit/promote/
 *   dismiss, lead state transitions, sends, outcome edits, vendor PII
 *   edits, admin replays, sync conflict resolutions, exports.
 *
 * Explicitly NOT audited: page views, autosave keystrokes, read-only
 * queries — the point is a legally-useful trail, not everything.
 *
 * Convention on `action` strings: `"<entity>.<verb>"`, e.g.
 *   auth.signin, auth.signin_rejected, auth.signout,
 *   agent.create, agent.update, agent.deactivate,
 *   user.role_change,
 *   pick.reason_note_save,
 *   outcome.record, sync.conflict_resolve.
 * before/after payloads are optional JSON snapshots of the record.
 */

export interface AuditParams {
  action: string;
  actor_user_id?: string | null;
  entity_type: string;
  entity_id?: string | null;
  lead_id?: string | null;
  before?: unknown;
  after?: unknown;
}

export async function logAudit(params: AuditParams): Promise<void> {
  await getDb().insert(audit_log).values({
    id: `audit_${crypto.randomUUID()}`,
    action: params.action,
    actor_user_id: params.actor_user_id ?? null,
    entity_type: params.entity_type,
    entity_id: params.entity_id ?? null,
    lead_id: params.lead_id ?? null,
    before_json: params.before === undefined ? null : JSON.stringify(params.before),
    after_json: params.after === undefined ? null : JSON.stringify(params.after),
    // at defaults to CURRENT_TIMESTAMP
  });
}
