import "server-only";

import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { feature_flags } from "@/db/schema";

/*
 * Feature-flag reads.
 *
 * All flags live in the `feature_flags` D1 table. Missing flag → false
 * (fail-closed). Kept deliberately dumb for Phase 1: one row-read per
 * call; if this shows up in profiling we cache per-request in a
 * WeakMap keyed on the current request context. Never cache across
 * requests — flags are the panic-off switch and must react in seconds.
 *
 * All PLAN adapters (§7), sync directions (§5.2/5.3), and notification
 * channels (§6/§11 rule 5) go through this. Naming convention:
 *   <domain>.<capability>_enabled       e.g. "sync.ac_out_enabled"
 *   <adapter>.enabled                   e.g. "cotality.enabled"
 *   <channel>.enabled                   e.g. "sms.enabled"
 */

export async function isFlagEnabled(name: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ enabled: feature_flags.enabled })
    .from(feature_flags)
    .where(eq(feature_flags.name, name))
    .limit(1);
  return row?.enabled ?? false;
}

export async function listFlags(): Promise<
  Array<{ name: string; enabled: boolean; notes: string | null; updated_at: string }>
> {
  return getDb()
    .select({
      name: feature_flags.name,
      enabled: feature_flags.enabled,
      notes: feature_flags.notes,
      updated_at: feature_flags.updated_at,
    })
    .from(feature_flags);
}
