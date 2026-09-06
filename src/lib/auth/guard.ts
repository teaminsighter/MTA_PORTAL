import "server-only";

import { eq } from "drizzle-orm";
import { auth, type UserRole } from "@/lib/auth";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";

/*
 * Server-action guards.
 *
 * Every mutating server action must call requireRole() before touching
 * data. requireRole re-reads `role` and `active` from the users table
 * per invocation — we deliberately do NOT trust the role stashed in
 * the JWT because:
 *
 *   - JWT lifetime is 8h; demoting or deactivating a user shouldn't
 *     wait that long to take effect.
 *   - If a session cookie is stolen, the attacker holds a valid JWT
 *     until it expires. Re-reading DB per action means we can shut
 *     them out immediately with a single `UPDATE users SET active=0`.
 *
 * Failure modes are typed error results (not thrown exceptions) so
 * clients can render inline messages without global error boundaries.
 */

export type Actor = {
  id: string;
  role: UserRole;
  email: string;
};

export type GuardError =
  | { ok: false; code: "unauthenticated" }
  | { ok: false; code: "forbidden"; required: readonly UserRole[]; actual: UserRole }
  | { ok: false; code: "inactive" };

export type GuardResult = { ok: true; actor: Actor } | GuardError;

/** Baseline: signed in, active, in users. Doesn't check role. */
export async function requireUser(): Promise<GuardResult> {
  const session = await auth();
  const sid = session?.user?.id;
  if (!sid || !session.user.email) return { ok: false, code: "unauthenticated" };

  const [row] = await getDb()
    .select({
      id: users.id,
      email: users.email,
      role: users.role,
      active: users.active,
    })
    .from(users)
    .where(eq(users.id, sid))
    .limit(1);

  if (!row) return { ok: false, code: "unauthenticated" };
  if (!row.active) return { ok: false, code: "inactive" };

  return {
    ok: true,
    actor: { id: row.id, role: row.role, email: row.email },
  };
}

/** Enforces one of the allowed roles. Returns a typed error otherwise. */
export async function requireRole(
  ...allowed: UserRole[]
): Promise<GuardResult> {
  const base = await requireUser();
  if (!base.ok) return base;
  if (!allowed.includes(base.actor.role)) {
    return {
      ok: false,
      code: "forbidden",
      required: allowed,
      actual: base.actor.role,
    };
  }
  return base;
}

/*
 * Common action-return shape. Actions bubble up their own success
 * payload, or a guard error, or the domain-specific `version_conflict`.
 */
export type ActionResult<T> =
  | { ok: true; data: T }
  | GuardError
  | { ok: false; code: "version_conflict"; latest_version: number }
  | { ok: false; code: "not_found" }
  | { ok: false; code: "validation"; message: string };
