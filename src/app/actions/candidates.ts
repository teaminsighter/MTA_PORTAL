"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  agent_candidates,
  agent_contact_log,
  agents,
  lead_agent_picks,
} from "@/db/schema";
import { getLeadRowId } from "@/lib/repo/leads";
import { requireRole, type ActionResult } from "@/lib/auth/guard";
import { logAudit } from "@/lib/audit";
import { isDemoMode } from "@/lib/demo/mode";

/*
 * Candidate flow: log a call outcome, promote to a signed(-ish) agent,
 * or dismiss.
 *
 * Every write here is audited (§4 audit scope: "agent and candidate
 * create/edit/promote/dismiss"). The Promote path also pre-picks the
 * new agent onto the lead so the shortlist shows them ticked without
 * a second click from Sarah — that's the "replaces the candidate card
 * with a normal agent card already ticked" bit of the plan.
 */

/* -------------------- log outcome -------------------- */

const CALL_OUTCOMES = [
  "answered",
  "voicemail",
  "no_answer",
  "declined",
  "agreed",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

const LogInput = z.object({
  candidate_id: z.string().min(1),
  lead_public_id: z.string().min(1),
  channel: z.enum(["call", "email", "sms"]).default("call"),
  outcome: z.enum(CALL_OUTCOMES),
  note: z.string().trim().max(2000).optional(),
});
export type LogCandidateContactInput = z.infer<typeof LogInput>;

export async function logCandidateContactAction(
  input: LogCandidateContactInput
): Promise<ActionResult<{ contact_log_id: string }>> {
  if (isDemoMode()) {
    return { ok: true, data: { contact_log_id: "demo_contact" } };
  }
  const guard = await requireRole("consultant", "admin");
  if (!guard.ok) return guard;

  const parsed = LogInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: parsed.error.message };
  }

  const leadRowId = await getLeadRowId(parsed.data.lead_public_id);
  const db = getDb();

  // Confirm the candidate exists.
  const [cand] = await db
    .select({ id: agent_candidates.id, status: agent_candidates.status })
    .from(agent_candidates)
    .where(eq(agent_candidates.id, parsed.data.candidate_id))
    .limit(1);
  if (!cand) return { ok: false, code: "not_found" };

  const id = `contact_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await db.insert(agent_contact_log).values({
    id,
    agent_id: null,
    candidate_id: parsed.data.candidate_id,
    lead_id: leadRowId ?? null,
    channel: parsed.data.channel,
    outcome: parsed.data.outcome,
    note: parsed.data.note ?? null,
    by_user: guard.actor.id,
    at: now,
  });

  // Bump candidate status to `contacted` once we've had any real
  // interaction. `agreed` also stays `contacted` — Promote is the
  // action that moves it to `promoted`.
  if (cand.status === "new") {
    await db
      .update(agent_candidates)
      .set({
        status: "contacted",
        version: sql`${agent_candidates.version} + 1`,
        updated_at: now,
      })
      .where(eq(agent_candidates.id, parsed.data.candidate_id));
  }

  await logAudit({
    action: "candidate.contact_logged",
    actor_user_id: guard.actor.id,
    entity_type: "agent_candidate",
    entity_id: parsed.data.candidate_id,
    lead_id: leadRowId ?? null,
    after: {
      channel: parsed.data.channel,
      outcome: parsed.data.outcome,
      note: parsed.data.note ?? null,
    },
  });

  revalidatePath("/leads/[id]", "page");
  return { ok: true, data: { contact_log_id: id } };
}

/* -------------------- promote -------------------- */

const SMS_CONSENT = ["yes_verbal", "yes_sms", "no", "unknown"] as const;
export type SmsConsent = (typeof SMS_CONSENT)[number];

const PromoteInput = z.object({
  candidate_id: z.string().min(1),
  lead_public_id: z.string().min(1),
  sms_consent: z.enum(SMS_CONSENT),
});
export type PromoteCandidateInput = z.infer<typeof PromoteInput>;

/*
 * Promote a candidate to an Agent (membership_status='verbally_agreed').
 * Also:
 *   - Records SMS consent per §8: sms_permission true iff yes_*,
 *     sms_consent_at + method captured always so we know when/why.
 *   - Auto-picks the new agent onto this lead so the shortlist shows
 *     the ticked card immediately without a second click.
 *   - Sets agent_candidates.status = 'promoted' and stashes the new
 *     match_agent_id so we can reconcile later.
 */
export async function promoteCandidateAction(
  input: PromoteCandidateInput
): Promise<ActionResult<{ agent_id: string }>> {
  if (isDemoMode()) {
    return { ok: true, data: { agent_id: `demo_agent_${input.candidate_id}` } };
  }
  const guard = await requireRole("consultant", "admin");
  if (!guard.ok) return guard;

  const parsed = PromoteInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: parsed.error.message };
  }

  const db = getDb();
  const leadRowId = await getLeadRowId(parsed.data.lead_public_id);
  if (!leadRowId) return { ok: false, code: "not_found" };

  const [cand] = await db
    .select()
    .from(agent_candidates)
    .where(eq(agent_candidates.id, parsed.data.candidate_id))
    .limit(1);
  if (!cand) return { ok: false, code: "not_found" };
  if (cand.status === "promoted" || cand.status === "dismissed") {
    return { ok: false, code: "validation", message: "candidate already resolved" };
  }

  const now = new Date().toISOString();
  const smsPermission =
    parsed.data.sms_consent === "yes_verbal" ||
    parsed.data.sms_consent === "yes_sms";
  const smsMethod =
    parsed.data.sms_consent === "yes_verbal"
      ? "verbal_on_call"
      : parsed.data.sms_consent === "yes_sms"
        ? "sms_reply"
        : parsed.data.sms_consent === "no"
          ? "declined"
          : "unknown";

  const agentId = `agent_${crypto.randomUUID()}`;
  await db.insert(agents).values({
    id: agentId,
    name: cand.name_raw,
    agency: cand.agency,
    phone: cand.phone,
    email: cand.email,
    membership_status: "verbally_agreed",
    sms_permission: smsPermission,
    sms_consent_at: now,
    sms_consent_method: smsMethod,
    signed_at: null,
    signed_by: guard.actor.id,
    notes: cand.reason_hint,
    reason_hint: cand.reason_hint,
    active: true,
    version: 1,
    created_at: now,
    updated_at: now,
  });

  // Mark the candidate resolved and link it to its new agent row.
  await db
    .update(agent_candidates)
    .set({
      status: "promoted",
      match_agent_id: agentId,
      version: sql`${agent_candidates.version} + 1`,
      updated_at: now,
    })
    .where(eq(agent_candidates.id, parsed.data.candidate_id));

  // Auto-pick the new agent onto this lead. display_order = max+1 so
  // the newest promotion lands at the bottom of the picked section.
  const [maxRow] = await db
    .select({
      max: sql<number>`COALESCE(MAX(${lead_agent_picks.display_order}), -1)`,
    })
    .from(lead_agent_picks)
    .where(eq(lead_agent_picks.lead_id, leadRowId));
  const nextOrder = Number(maxRow?.max ?? -1) + 1;

  await db.insert(lead_agent_picks).values({
    id: `pick_${crypto.randomUUID()}`,
    lead_id: leadRowId,
    agent_id: agentId,
    reason_note: cand.reason_hint,
    display_order: nextOrder,
    picked_by: guard.actor.id,
    picked_at: now,
    unpicked_at: null,
    version: 1,
  });

  await logAudit({
    action: "candidate.promoted",
    actor_user_id: guard.actor.id,
    entity_type: "agent_candidate",
    entity_id: parsed.data.candidate_id,
    lead_id: leadRowId,
    before: { status: cand.status, membership_status: null },
    after: {
      agent_id: agentId,
      membership_status: "verbally_agreed",
      sms_permission: smsPermission,
      sms_consent_method: smsMethod,
    },
  });

  revalidatePath("/leads/[id]", "page");
  return { ok: true, data: { agent_id: agentId } };
}

/* -------------------- dismiss -------------------- */

const DismissInput = z.object({
  candidate_id: z.string().min(1),
  lead_public_id: z.string().min(1),
  reason: z.string().trim().max(500).optional(),
});
export type DismissCandidateInput = z.infer<typeof DismissInput>;

export async function dismissCandidateAction(
  input: DismissCandidateInput
): Promise<ActionResult<{ candidate_id: string }>> {
  if (isDemoMode()) {
    return { ok: true, data: { candidate_id: input.candidate_id } };
  }
  const guard = await requireRole("consultant", "admin");
  if (!guard.ok) return guard;

  const parsed = DismissInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: parsed.error.message };
  }

  const db = getDb();
  const leadRowId = await getLeadRowId(parsed.data.lead_public_id);

  const [cand] = await db
    .select({ id: agent_candidates.id, status: agent_candidates.status })
    .from(agent_candidates)
    .where(eq(agent_candidates.id, parsed.data.candidate_id))
    .limit(1);
  if (!cand) return { ok: false, code: "not_found" };
  if (cand.status === "promoted") {
    return { ok: false, code: "validation", message: "cannot dismiss a promoted candidate" };
  }

  const now = new Date().toISOString();
  await db
    .update(agent_candidates)
    .set({
      status: "dismissed",
      version: sql`${agent_candidates.version} + 1`,
      updated_at: now,
    })
    .where(
      and(
        eq(agent_candidates.id, parsed.data.candidate_id),
        // Guarantees we don't step on a race with a concurrent promote.
        eq(agent_candidates.status, cand.status)
      )
    );

  await logAudit({
    action: "candidate.dismissed",
    actor_user_id: guard.actor.id,
    entity_type: "agent_candidate",
    entity_id: parsed.data.candidate_id,
    lead_id: leadRowId ?? null,
    before: { status: cand.status },
    after: { status: "dismissed", reason: parsed.data.reason ?? null },
  });

  revalidatePath("/leads/[id]", "page");
  return { ok: true, data: { candidate_id: parsed.data.candidate_id } };
}
