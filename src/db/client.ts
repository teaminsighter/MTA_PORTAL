import "server-only";

import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import * as schema from "./schema";

/*
 * Returns a Drizzle client bound to the current environment's D1.
 *
 * In production/staging the D1 binding comes from wrangler.toml. In
 * `next dev` it comes from miniflare via initOpenNextCloudflareForDev()
 * (see next.config.ts) — same code path either way.
 *
 * Always call inside a request scope (server component / route handler /
 * server action). Do not cache the returned client at module top-level.
 */
export function getDb(): DrizzleD1Database<typeof schema> {
  const { env } = getCloudflareContext();
  const binding = (env as unknown as { DB?: D1Database }).DB;
  if (!binding) {
    throw new Error(
      "D1 binding `DB` is missing. Check wrangler.toml + next.config.ts."
    );
  }
  return drizzle(binding, { schema });
}

export type Db = ReturnType<typeof getDb>;
