"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/db/client";
import { users, USER_ROLES } from "@/db/schema";
import { requireRole, type ActionResult } from "@/lib/auth/guard";
import { logAudit } from "@/lib/audit";

/*
 * Admin-only role change. Audited via a before/after snapshot so a
 * later revocation of privileges is traceable to the actor and moment.
 */

const Input = z.object({
  user_id: z.string().min(1),
  expected_version: z.number().int().positive(),
  new_role: z.enum(USER_ROLES),
});
export type UpdateUserRoleInput = z.infer<typeof Input>;

export async function updateUserRoleAction(
  input: UpdateUserRoleInput
): Promise<ActionResult<{ version: number; role: (typeof USER_ROLES)[number] }>> {
  const guard = await requireRole("admin");
  if (!guard.ok) return guard;

  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    return { ok: false, code: "validation", message: parsed.error.message };
  }

  const db = getDb();

  const [before] = await db
    .select({ id: users.id, role: users.role, version: users.version, email: users.email })
    .from(users)
    .where(eq(users.id, parsed.data.user_id))
    .limit(1);
  if (!before) return { ok: false, code: "not_found" };

  const result = await db
    .update(users)
    .set({
      role: parsed.data.new_role,
      version: sql`${users.version} + 1`,
    })
    .where(
      and(
        eq(users.id, parsed.data.user_id),
        eq(users.version, parsed.data.expected_version)
      )
    )
    .returning({ role: users.role, version: users.version });

  if (result.length === 0) {
    const [row] = await db
      .select({ version: users.version })
      .from(users)
      .where(eq(users.id, parsed.data.user_id))
      .limit(1);
    if (!row) return { ok: false, code: "not_found" };
    return { ok: false, code: "version_conflict", latest_version: row.version };
  }

  await logAudit({
    action: "user.role_change",
    actor_user_id: guard.actor.id,
    entity_type: "user",
    entity_id: before.id,
    before: { email: before.email, role: before.role, version: before.version },
    after: { role: result[0].role, version: result[0].version },
  });

  revalidatePath("/admin");
  return { ok: true, data: { version: result[0].version, role: result[0].role } };
}
