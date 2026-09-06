import "server-only";

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { logAudit } from "@/lib/audit";

/*
 * Auth.js (NextAuth v5) — Google-only, allowlist-gated.
 *
 * Sign-in rejects if:
 *   1. Google didn't verify the email (email_verified !== true)
 *   2. The email isn't in the `users` table
 *   3. The user row exists but is inactive
 *
 * Session strategy: JWT. Roles ride on the token so route handlers,
 * middleware, and server components can read them without a DB hit.
 * The DB lookup runs once at sign-in.
 *
 * All configuration comes from env:
 *   AUTH_SECRET, AUTH_GOOGLE_ID, AUTH_GOOGLE_SECRET
 * plus Cloudflare's TRUST_HOST behaviour when running behind Workers.
 */

export const { auth, handlers, signIn, signOut } = NextAuth({
  providers: [
    Google({
      // v5 reads AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET from env automatically
      // if we don't pass clientId / clientSecret here.
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
  ],

  // 8h JWT lifetime. Short enough that a compromised cookie stops working
  // by the end of the working day; long enough that Sarah doesn't re-auth
  // mid-shift. The role guard (src/lib/auth/guard.ts) also re-reads role +
  // active from the users table on every mutation, so any demote /
  // deactivate takes effect immediately regardless of JWT age.
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 },
  trustHost: true,

  pages: {
    signIn: "/signin",
    error: "/signin", // sign-in page reads ?error=… and renders a message
  },

  callbacks: {
    /*
     * Called after Google returns the user. Must return `true` to allow
     * sign-in, `false` (or throw) to reject. Rejection surfaces to the
     * sign-in page via ?error=AccessDenied.
     */
    async signIn({ account, profile }) {
      const email = profile?.email?.toLowerCase() ?? null;
      const emailVerified = (profile as { email_verified?: boolean } | null)
        ?.email_verified === true;

      // Reject non-Google, unverified, or unknown-email cases. Log the
      // rejection so a repeated attempt is visible in audit_log.
      if (account?.provider !== "google" || !email || !emailVerified) {
        await logAudit({
          action: "auth.signin_rejected",
          entity_type: "auth",
          after: {
            reason: !emailVerified
              ? "email_not_verified"
              : account?.provider !== "google"
                ? "wrong_provider"
                : "missing_email",
            attempted_email: email,
          },
        });
        return false;
      }

      const [row] = await getDb()
        .select({
          id: users.id,
          active: users.active,
          role: users.role,
        })
        .from(users)
        .where(eq(users.email, email))
        .limit(1);

      if (!row || !row.active) {
        await logAudit({
          action: "auth.signin_rejected",
          entity_type: "auth",
          after: {
            reason: !row ? "not_in_allowlist" : "inactive",
            attempted_email: email,
          },
        });
        return false;
      }

      await logAudit({
        action: "auth.signin",
        actor_user_id: row.id,
        entity_type: "user",
        entity_id: row.id,
        after: { email, role: row.role },
      });
      return true;
    },

    /*
     * On first sign-in, look up the user again (signIn already validated
     * so this can't throw for allowlisted users) and stash role + user id
     * on the JWT. Subsequent requests reuse the same token.
     */
    async jwt({ token, user }) {
      if (user?.email) {
        const [row] = await getDb()
          .select({
            id: users.id,
            role: users.role,
            googleSub: users.google_sub,
          })
          .from(users)
          .where(eq(users.email, user.email.toLowerCase()))
          .limit(1);
        if (row) {
          token.userId = row.id;
          token.role = row.role;
          // Record google_sub the first time we see it so a compromised
          // email can be paired with its Google identity for audit.
          if (!row.googleSub && (user as { id?: string }).id) {
            await getDb()
              .update(users)
              .set({
                google_sub: (user as { id?: string }).id ?? null,
                last_login_at: new Date().toISOString(),
              })
              .where(eq(users.id, row.id));
          } else {
            await getDb()
              .update(users)
              .set({ last_login_at: new Date().toISOString() })
              .where(eq(users.id, row.id));
          }
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId as string;
      if (token.role) session.user.role = token.role as UserRole;
      return session;
    },
  },
});

export type UserRole = "consultant" | "admin" | "readonly";
