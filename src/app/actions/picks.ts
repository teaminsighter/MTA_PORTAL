"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { lead_agent_picks } from "@/db/schema";
import { getLeadRowId } from "@/lib/repo/leads";
import { requireRole, type ActionResult } from "@/lib/auth/guard";
import { logAudit } from "@/lib/audit";

/*
 * Per-pick reason note.
 *
 * Reasons live on lead_agent_picks, keyed by (lead_id, agent_id), NOT on
 * agents. agents.reason_hint is a *template* that pre-fills an empty
 * reason on the workspace — it isn't overwritten by consultant edits.
 *
 * The pick row also carries its own `version` for optimistic writes.
 * expected_version === 0 means "no pick row yet, create it"; anything
 * else means "update this specific version". The row's unique index on
 * (lead_id, agent_id) is what enforces one-pick-per-agent-per-lead.
 */

const Input = z.object({
  lead_public_id: z.string().min(1),
  agent_id: z.string().min(1),
  reason_note: z.string().trim().max(1000),
  // 0 = create new; N>0 = update existing at this version.
  expected_version: z.number().int().nonnegative(),
});
export type SaveReasonNoteInput = z.infer<typeof Input>;

export async function saveReasonNoteAction(
  input: SaveReasonNoteInput
): Promise<ActionResult<{ version: number }>> {
  const guard = await requireRole("consultant", "admin");
  if (!guard.ok) return guard;

  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: parsed.error.message };
  }

  const leadRowId = await getLeadRowId(parsed.data.lead_public_id);
  if (!leadRowId) return { ok: false, code: "not_found" };

  const db = getDb();
  const now = new Date().toISOString();
  const reason = parsed.data.reason_note.trim();

  // -------- Create path (no pick row yet) --------
  if (parsed.data.expected_version === 0) {
    // The unique index on (lead_id, agent_id) makes a second concurrent
    // creator lose the race deterministically. INSERT OR IGNORE keeps
    // the SQL portable across D1/miniflare/sqlite drivers.
    const inserted = await db
      .insert(lead_agent_picks)
      .values({
        id: `pick_${crypto.randomUUID()}`,
        lead_id: leadRowId,
        agent_id: parsed.data.agent_id,
        reason_note: reason,
        display_order: 0,
        picked_by: guard.actor.id,
        picked_at: now,
        version: 1,
      })
      .onConflictDoNothing({
        target: [lead_agent_picks.lead_id, lead_agent_picks.agent_id],
      })
      .returning({ version: lead_agent_picks.version });

    if (inserted.length > 0) {
      await logAudit({
        action: "pick.reason_note_save",
        actor_user_id: guard.actor.id,
        entity_type: "lead_agent_pick",
        entity_id: parsed.data.agent_id,
        lead_id: leadRowId,
        after: { version: inserted[0].version, created: true },
      });
      revalidatePath("/leads/[id]", "page");
      return { ok: true, data: { version: inserted[0].version } };
    }

    // Someone else created the row first. Report the current version so
    // the client can retry with expected_version = that.
    const [row] = await db
      .select({ version: lead_agent_picks.version })
      .from(lead_agent_picks)
      .where(
        and(
          eq(lead_agent_picks.lead_id, leadRowId),
          eq(lead_agent_picks.agent_id, parsed.data.agent_id)
        )
      )
      .limit(1);
    if (!row) return { ok: false, code: "not_found" }; // shouldn't happen
    return { ok: false, code: "version_conflict", latest_version: row.version };
  }

  // -------- Update path (pick row exists at expected_version) --------
  const result = await db
    .update(lead_agent_picks)
    .set({
      reason_note: reason,
      version: sql`${lead_agent_picks.version} + 1`,
    })
    .where(
      and(
        eq(lead_agent_picks.lead_id, leadRowId),
        eq(lead_agent_picks.agent_id, parsed.data.agent_id),
        eq(lead_agent_picks.version, parsed.data.expected_version)
      )
    )
    .returning({ version: lead_agent_picks.version });

  if (result.length === 0) {
    // Either row doesn't exist any more, or version moved on.
    const [row] = await db
      .select({ version: lead_agent_picks.version })
      .from(lead_agent_picks)
      .where(
        and(
          eq(lead_agent_picks.lead_id, leadRowId),
          eq(lead_agent_picks.agent_id, parsed.data.agent_id)
        )
      )
      .limit(1);
    if (!row) return { ok: false, code: "not_found" };
    return { ok: false, code: "version_conflict", latest_version: row.version };
  }

  await logAudit({
    action: "pick.reason_note_save",
    actor_user_id: guard.actor.id,
    entity_type: "lead_agent_pick",
    entity_id: parsed.data.agent_id,
    lead_id: leadRowId,
    before: { version: parsed.data.expected_version },
    after: { version: result[0].version },
  });

  revalidatePath("/leads/[id]", "page");
  return { ok: true, data: { version: result[0].version } };
}

/* ================================================================== */
/* pickAgentAction / unpickAgentAction                                */
/*                                                                    */
/* Toggle "this agent is on the shortlist" for a lead. Ticks/unticks  */
/* map to two distinct row states on lead_agent_picks:                */
/*   picked    → row exists AND unpicked_at IS NULL                   */
/*   unpicked  → row exists AND unpicked_at IS NOT NULL               */
/*   never     → no row for (lead, agent)                             */
/*                                                                    */
/* Pick is idempotent — clicking twice is fine. Unpick is optimistic  */
/* on the row version so two consultants can't both "clear" a pick    */
/* and mask each other's intent silently.                             */
/* ================================================================== */

const PickInput = z.object({
  lead_public_id: z.string().min(1),
  agent_id: z.string().min(1),
});
export type PickAgentInput = z.infer<typeof PickInput>;

const UnpickInput = z.object({
  lead_public_id: z.string().min(1),
  agent_id: z.string().min(1),
  expected_version: z.number().int().positive(),
});
export type UnpickAgentInput = z.infer<typeof UnpickInput>;

/**
 * Tick an agent onto the shortlist. Creates the pick row if this is
 * the first time; clears `unpicked_at` if the row was previously
 * unpicked. display_order is set to (max existing) + 1 so newly
 * picked agents land at the bottom of the picked section, which is
 * the reading order Sarah just added them in.
 *
 * Idempotent: picking an already-picked agent bumps version but
 * doesn't change display_order.
 */
export async function pickAgentAction(
  input: PickAgentInput
): Promise<ActionResult<{ version: number; display_order: number }>> {
  const guard = await requireRole("consultant", "admin");
  if (!guard.ok) return guard;

  const parsed = PickInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: parsed.error.message };
  }

  const leadRowId = await getLeadRowId(parsed.data.lead_public_id);
  if (!leadRowId) return { ok: false, code: "not_found" };

  const db = getDb();
  const now = new Date().toISOString();

  // Compute the next display_order slot for new picks. D1 serialises
  // writes so we don't race here, but ties resolve by picked_at anyway.
  const [maxRow] = await db
    .select({ max: sql<number>`COALESCE(MAX(${lead_agent_picks.display_order}), -1)` })
    .from(lead_agent_picks)
    .where(eq(lead_agent_picks.lead_id, leadRowId));
  const nextOrder = Number(maxRow?.max ?? -1) + 1;

  const [row] = await db
    .insert(lead_agent_picks)
    .values({
      id: `pick_${crypto.randomUUID()}`,
      lead_id: leadRowId,
      agent_id: parsed.data.agent_id,
      reason_note: null,
      display_order: nextOrder,
      picked_by: guard.actor.id,
      picked_at: now,
      unpicked_at: null,
      version: 1,
    })
    .onConflictDoUpdate({
      target: [lead_agent_picks.lead_id, lead_agent_picks.agent_id],
      set: {
        unpicked_at: null,
        version: sql`${lead_agent_picks.version} + 1`,
      },
    })
    .returning({
      version: lead_agent_picks.version,
      display_order: lead_agent_picks.display_order,
    });

  await logAudit({
    action: "pick.pick",
    actor_user_id: guard.actor.id,
    entity_type: "lead_agent_pick",
    entity_id: parsed.data.agent_id,
    lead_id: leadRowId,
    after: { version: row.version, display_order: row.display_order },
  });

  revalidatePath("/leads/[id]", "page");
  return {
    ok: true,
    data: { version: row.version, display_order: row.display_order },
  };
}

/**
 * Untick an agent — soft-delete the pick by stamping `unpicked_at`.
 * We keep the row so display_order and reason_note survive a
 * re-pick; the agent slides back into place in the reading order.
 */
export async function unpickAgentAction(
  input: UnpickAgentInput
): Promise<ActionResult<{ version: number }>> {
  const guard = await requireRole("consultant", "admin");
  if (!guard.ok) return guard;

  const parsed = UnpickInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: parsed.error.message };
  }

  const leadRowId = await getLeadRowId(parsed.data.lead_public_id);
  if (!leadRowId) return { ok: false, code: "not_found" };

  const db = getDb();
  const now = new Date().toISOString();

  const result = await db
    .update(lead_agent_picks)
    .set({
      unpicked_at: now,
      version: sql`${lead_agent_picks.version} + 1`,
    })
    .where(
      and(
        eq(lead_agent_picks.lead_id, leadRowId),
        eq(lead_agent_picks.agent_id, parsed.data.agent_id),
        eq(lead_agent_picks.version, parsed.data.expected_version)
      )
    )
    .returning({ version: lead_agent_picks.version });

  if (result.length === 0) {
    const [row] = await db
      .select({ version: lead_agent_picks.version })
      .from(lead_agent_picks)
      .where(
        and(
          eq(lead_agent_picks.lead_id, leadRowId),
          eq(lead_agent_picks.agent_id, parsed.data.agent_id)
        )
      )
      .limit(1);
    if (!row) return { ok: false, code: "not_found" };
    return { ok: false, code: "version_conflict", latest_version: row.version };
  }

  await logAudit({
    action: "pick.unpick",
    actor_user_id: guard.actor.id,
    entity_type: "lead_agent_pick",
    entity_id: parsed.data.agent_id,
    lead_id: leadRowId,
    before: { version: parsed.data.expected_version },
    after: { version: result[0].version, unpicked_at: now },
  });

  revalidatePath("/leads/[id]", "page");
  return { ok: true, data: { version: result[0].version } };
}

