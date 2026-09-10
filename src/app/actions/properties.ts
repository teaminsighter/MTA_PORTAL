"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { properties } from "@/db/schema";
import { getLeadRowId } from "@/lib/repo/leads";
import { requireRole, type ActionResult } from "@/lib/auth/guard";
import { logAudit } from "@/lib/audit";
import { isDemoMode } from "@/lib/demo/mode";

/*
 * Manual property field save.
 *
 * Caller passes a partial `patch` — only the fields the consultant
 * touched. For each field present in the patch we write:
 *   <field>              = new value (or NULL to clear)
 *   <field>_source       = "manual"
 *   <field>_fetched_at   = now
 * so PLAN §7 rule 1 holds: manual always wins. An enrichment adapter
 * later refreshing a value will skip fields with source='manual'.
 *
 * Optimistic concurrency the same as agents/picks:
 *   expected_version === 0 → INSERT the row (first save on a lead
 *                              that had no property record); UNIQUE
 *                              collision → version_conflict.
 *   expected_version > 0   → UPDATE ... WHERE version = expected;
 *                              zero rows affected → version_conflict.
 *
 * Zod validates the shape; empty patches are rejected so a stale save
 * doesn't bump the version for nothing.
 */

const PatchSchema = z
  .object({
    cv: z.number().int().nonnegative().nullable().optional(),
    land_value: z.number().int().nonnegative().nullable().optional(),
    improvements: z.number().int().nonnegative().nullable().optional(),
    estimate: z.number().int().nonnegative().nullable().optional(),
    land_area: z.number().int().nonnegative().nullable().optional(),
    floor_area: z.number().int().nonnegative().nullable().optional(),
    bedrooms: z.number().int().nonnegative().max(50).nullable().optional(),
    year_built: z
      .number()
      .int()
      .min(1800)
      .max(new Date().getUTCFullYear() + 1)
      .nullable()
      .optional(),
    last_sold_date: z.string().date().nullable().optional(),
    last_sold_price: z.number().int().nonnegative().nullable().optional(),
  })
  .refine((patch) => Object.keys(patch).length > 0, "patch is empty");

const Input = z.object({
  lead_public_id: z.string().min(1),
  expected_version: z.number().int().nonnegative(),
  patch: PatchSchema,
});
export type UpdatePropertyFieldsInput = z.infer<typeof Input>;

type FactField =
  | "cv"
  | "land_value"
  | "improvements"
  | "estimate"
  | "land_area"
  | "floor_area"
  | "bedrooms"
  | "year_built"
  | "last_sold_date"
  | "last_sold_price";

const FACT_FIELDS: FactField[] = [
  "cv",
  "land_value",
  "improvements",
  "estimate",
  "land_area",
  "floor_area",
  "bedrooms",
  "year_built",
  "last_sold_date",
  "last_sold_price",
];

export async function updatePropertyFieldsAction(
  input: UpdatePropertyFieldsInput
): Promise<ActionResult<{ version: number; updated_at: string }>> {
  if (isDemoMode()) {
    return {
      ok: true,
      data: { version: input.expected_version + 1, updated_at: new Date().toISOString() },
    };
  }
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
  const patch = parsed.data.patch as Partial<Record<FactField, unknown>>;

  /*
   * Build the set clause once for reuse in both the insert-first-save
   * and the update-existing paths. Each patched field also stamps its
   * `_source = 'manual'` + `_fetched_at = now` so provenance is
   * always in step with the value.
   */
  const setClause: Record<string, unknown> = {
    version: sql`${properties.version} + 1`,
    updated_at: now,
  };
  const insertRow: Record<string, unknown> = {
    lead_id: leadRowId,
    version: 1,
    updated_at: now,
  };
  for (const field of FACT_FIELDS) {
    if (field in patch) {
      const value = patch[field] ?? null;
      setClause[field] = value;
      setClause[`${field}_source`] = "manual";
      setClause[`${field}_fetched_at`] = now;
      insertRow[field] = value;
      insertRow[`${field}_source`] = "manual";
      insertRow[`${field}_fetched_at`] = now;
    }
  }

  // Create path: no row yet.
  if (parsed.data.expected_version === 0) {
    const inserted = await db
      .insert(properties)
      .values(insertRow as typeof properties.$inferInsert)
      .onConflictDoNothing({ target: properties.lead_id })
      .returning({ version: properties.version, updated_at: properties.updated_at });

    if (inserted.length > 0) {
      await logAudit({
        action: "property.create",
        actor_user_id: guard.actor.id,
        entity_type: "property",
        entity_id: leadRowId,
        lead_id: leadRowId,
        after: { version: inserted[0].version, patch: parsed.data.patch },
      });
      revalidatePath("/leads/[id]", "page");
      return {
        ok: true,
        data: {
          version: inserted[0].version,
          updated_at: inserted[0].updated_at,
        },
      };
    }
    // Row already exists; report its current version so the client
    // can retry with the right expected_version.
    const [row] = await db
      .select({ version: properties.version })
      .from(properties)
      .where(eq(properties.lead_id, leadRowId))
      .limit(1);
    if (!row) return { ok: false, code: "not_found" };
    return { ok: false, code: "version_conflict", latest_version: row.version };
  }

  // Update path.
  const result = await db
    .update(properties)
    .set(setClause as typeof properties.$inferInsert)
    .where(
      and(
        eq(properties.lead_id, leadRowId),
        eq(properties.version, parsed.data.expected_version)
      )
    )
    .returning({ version: properties.version, updated_at: properties.updated_at });

  if (result.length === 0) {
    const [row] = await db
      .select({ version: properties.version })
      .from(properties)
      .where(eq(properties.lead_id, leadRowId))
      .limit(1);
    if (!row) return { ok: false, code: "not_found" };
    return { ok: false, code: "version_conflict", latest_version: row.version };
  }

  await logAudit({
    action: "property.update",
    actor_user_id: guard.actor.id,
    entity_type: "property",
    entity_id: leadRowId,
    lead_id: leadRowId,
    before: { version: parsed.data.expected_version },
    after: { version: result[0].version, patch: parsed.data.patch },
  });

  revalidatePath("/leads/[id]", "page");
  return {
    ok: true,
    data: { version: result[0].version, updated_at: result[0].updated_at },
  };
}
