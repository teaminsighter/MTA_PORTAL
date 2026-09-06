"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { agents, MEMBERSHIP_STATUSES } from "@/db/schema";
import { requireRole, type ActionResult } from "@/lib/auth/guard";
import type { Agent } from "@/lib/mock";

/*
 * Agent CRUD server actions.
 *
 *   list        — consultant / admin / readonly. Returns active agents.
 *   create      — consultant / admin. Returns the new agent.
 *   update      — consultant / admin. Optimistic version check; returns
 *                 { code: "version_conflict", latest_version } on stale
 *                 writes so the UI can prompt the user to refresh.
 *   deactivate  — admin only. Soft delete via active=false.
 *
 * All mutations bump version and stamp updated_at. Audit_log writes
 * land in Phase 1 step 5.
 */

/* ---------------------------------------------------------------- */
/* Row helpers                                                      */
/* ---------------------------------------------------------------- */

type Row = typeof agents.$inferSelect;

function toAgent(row: Row): Agent {
  return {
    id: row.id,
    name: row.name,
    agency: row.agency,
    phone: row.phone,
    email: row.email,
    membership_status: row.membership_status,
    sms_permission: row.sms_permission,
    sales_last_12mo: row.sales_last_12mo,
    avg_days_on_market: row.avg_days_on_market,
    nearby_sales: row.nearby_sales,
    reason_hint: row.reason_hint ?? "",
  };
}

// Public shape for callers that need to know the current row version to
// pass back in a subsequent update() call.
export interface AgentWithVersion {
  agent: Agent;
  version: number;
}

/* ---------------------------------------------------------------- */
/* Zod validation                                                   */
/* ---------------------------------------------------------------- */

const trimmedString = (max: number) =>
  z.string().trim().min(1).max(max);

const CreateInput = z.object({
  name: trimmedString(120),
  agency: z.string().trim().max(120).default(""),
  phone: z.string().trim().max(40).default(""),
  email: z.string().trim().email().max(200).or(z.literal("")).default(""),
  membership_status: z.enum(MEMBERSHIP_STATUSES),
  sms_permission: z.boolean().default(false),
  reason_hint: z.string().trim().max(500).optional(),
});
export type CreateAgentInput = z.infer<typeof CreateInput>;

const UpdateInput = z.object({
  id: z.string().min(1),
  expected_version: z.number().int().positive(),
  patch: z.object({
    name: trimmedString(120).optional(),
    agency: z.string().trim().max(120).optional(),
    phone: z.string().trim().max(40).optional(),
    email: z.string().trim().email().max(200).or(z.literal("")).optional(),
    membership_status: z.enum(MEMBERSHIP_STATUSES).optional(),
    sms_permission: z.boolean().optional(),
    reason_hint: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(2000).optional(),
  }),
});
export type UpdateAgentInput = z.infer<typeof UpdateInput>;

const DeactivateInput = z.object({
  id: z.string().min(1),
  expected_version: z.number().int().positive(),
});
export type DeactivateAgentInput = z.infer<typeof DeactivateInput>;

/* ---------------------------------------------------------------- */
/* Actions                                                          */
/* ---------------------------------------------------------------- */

export async function listAgentsAction(): Promise<ActionResult<Agent[]>> {
  const guard = await requireRole("consultant", "admin", "readonly");
  if (!guard.ok) return guard;
  const rows = await getDb()
    .select()
    .from(agents)
    .where(eq(agents.active, true));
  return { ok: true, data: rows.map(toAgent) };
}

export async function createAgentAction(
  input: CreateAgentInput
): Promise<ActionResult<AgentWithVersion>> {
  const guard = await requireRole("consultant", "admin");
  if (!guard.ok) return guard;

  const parsed = CreateInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: parsed.error.message };
  }

  const id = `agent_${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await getDb()
    .insert(agents)
    .values({
      id,
      name: parsed.data.name,
      agency: parsed.data.agency,
      phone: parsed.data.phone,
      email: parsed.data.email,
      membership_status: parsed.data.membership_status,
      sms_permission: parsed.data.sms_permission,
      reason_hint: parsed.data.reason_hint ?? null,
      active: true,
      version: 1,
      created_at: now,
      updated_at: now,
    });

  const [row] = await getDb()
    .select()
    .from(agents)
    .where(eq(agents.id, id))
    .limit(1);

  revalidatePath("/leads/[id]", "page");
  return { ok: true, data: { agent: toAgent(row), version: row.version } };
}

/*
 * Optimistic-concurrency update.
 *
 *   UPDATE agents
 *      SET <patch>, version = version + 1, updated_at = ?
 *    WHERE id = ? AND version = ?
 *
 * Zero rows affected means someone else wrote between the caller's
 * read and this write. We fetch the current row and return its
 * version so the client can decide how to reconcile (usually: reload
 * and let the user re-apply their edit against fresh data).
 */
export async function updateAgentAction(
  input: UpdateAgentInput
): Promise<ActionResult<AgentWithVersion>> {
  const guard = await requireRole("consultant", "admin");
  if (!guard.ok) return guard;

  const parsed = UpdateInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: parsed.error.message };
  }

  const now = new Date().toISOString();
  const db = getDb();

  const result = await db
    .update(agents)
    .set({
      ...parsed.data.patch,
      updated_at: now,
      version: sql`${agents.version} + 1`,
    })
    .where(
      and(
        eq(agents.id, parsed.data.id),
        eq(agents.version, parsed.data.expected_version)
      )
    )
    .returning();

  if (result.length === 0) {
    return await conflictOrNotFound(db, parsed.data.id);
  }

  revalidatePath("/leads/[id]", "page");
  return {
    ok: true,
    data: { agent: toAgent(result[0]), version: result[0].version },
  };
}

export async function deactivateAgentAction(
  input: DeactivateAgentInput
): Promise<ActionResult<AgentWithVersion>> {
  const guard = await requireRole("admin");
  if (!guard.ok) return guard;

  const parsed = DeactivateInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: parsed.error.message };
  }

  const db = getDb();
  const now = new Date().toISOString();
  const result = await db
    .update(agents)
    .set({
      active: false,
      updated_at: now,
      version: sql`${agents.version} + 1`,
    })
    .where(
      and(
        eq(agents.id, parsed.data.id),
        eq(agents.version, parsed.data.expected_version)
      )
    )
    .returning();

  if (result.length === 0) {
    return await conflictOrNotFound(db, parsed.data.id);
  }

  revalidatePath("/leads/[id]", "page");
  revalidatePath("/admin");
  return {
    ok: true,
    data: { agent: toAgent(result[0]), version: result[0].version },
  };
}

/* ---------------------------------------------------------------- */
/* Internals                                                        */
/* ---------------------------------------------------------------- */

/*
 * Zero rows affected by an optimistic UPDATE means one of two things:
 *   - the row was deleted since the caller read it (not_found), or
 *   - someone else wrote to it and bumped the version (version_conflict).
 * We look up once more so the client can render the right message and
 * pick a resolution.
 */
async function conflictOrNotFound(
  db: ReturnType<typeof getDb>,
  id: string
): Promise<ActionResult<never>> {
  const [row] = await db
    .select({ version: agents.version })
    .from(agents)
    .where(eq(agents.id, id))
    .limit(1);
  if (!row) return { ok: false, code: "not_found" };
  return { ok: false, code: "version_conflict", latest_version: row.version };
}
