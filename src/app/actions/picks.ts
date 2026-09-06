"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { lead_agent_picks } from "@/db/schema";
import { getLeadRowId } from "@/lib/repo/leads";
import { requireRole, type ActionResult } from "@/lib/auth/guard";

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

  revalidatePath("/leads/[id]", "page");
  return { ok: true, data: { version: result[0].version } };
}
