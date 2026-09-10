import "server-only";

import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { audit_log } from "@/db/schema";
import { getLeadRowId } from "@/lib/repo/leads";
import { isDemoMode } from "@/lib/demo/mode";
import { demoListActivityForLead } from "@/lib/demo/data";
import type { ActivityEvent, ActivityType } from "@/lib/mock";

/*
 * Timeline data. For Phase 1 the source is audit_log rows scoped to a lead.
 * Once dispatch (§6) and sync (§5.2/5.3) land, this repo will merge rows
 * from deliveries + sync_events for a richer trail. The UI shape stays the
 * same — one ActivityEvent per row — so the Timeline component doesn't
 * change.
 */

// Maps our internal `action` strings to the UI's ActivityType categories.
function mapActionToType(action: string): ActivityType {
  if (action.startsWith("send")) return "send";
  if (action.startsWith("delivery")) return "delivery";
  if (action.startsWith("enrich")) return "enrichment_done";
  if (action.startsWith("ac_sync_in")) return "ac_sync_in";
  if (action.startsWith("ac_sync_out")) return "ac_sync_out";
  if (action.startsWith("vendor_open")) return "vendor_open";
  if (action.startsWith("lead_received")) return "lead_received";
  return "state_change";
}

export async function listActivityForLead(
  publicLeadId: string
): Promise<ActivityEvent[]> {
  if (isDemoMode()) return demoListActivityForLead(publicLeadId);
  const rowId = await getLeadRowId(publicLeadId);
  if (!rowId) return [];
  const rows = await getDb()
    .select({
      action: audit_log.action,
      at: audit_log.at,
      after_json: audit_log.after_json,
    })
    .from(audit_log)
    .where(eq(audit_log.lead_id, rowId))
    .orderBy(desc(audit_log.at));

  return rows.map<ActivityEvent>((r) => {
    let detail = r.action;
    if (r.after_json) {
      try {
        const parsed = JSON.parse(r.after_json) as { detail?: string };
        if (parsed.detail) detail = parsed.detail;
      } catch {
        // ignore; keep the action as detail
      }
    }
    return {
      type: mapActionToType(r.action),
      at: r.at,
      detail,
    };
  });
}
