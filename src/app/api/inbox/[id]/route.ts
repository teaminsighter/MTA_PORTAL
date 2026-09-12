export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { auth } from "@/lib/auth";
import { isDemoMode } from "@/lib/demo/mode";
import { getLead } from "@/lib/repo/leads";
import { getPropertyForLead } from "@/lib/repo/properties";
import { listComparablesForLead } from "@/lib/repo/comparables";
import { getShortlistForLead } from "@/lib/repo/agents";
import { listCandidatesForLead } from "@/lib/repo/candidates";
import { listActivityForLead } from "@/lib/repo/activity";
import type {
  ActivityEvent,
  Agent,
  AgentCandidate,
  Comparable,
  Lead,
  PropertyFacts,
} from "@/lib/mock";

/*
 * GET /api/inbox/[id] — rich preview payload for the inbox right pane.
 *
 * Returns everything Sarah needs to triage the lead without opening
 * the full workspace:
 *   - full property facts (with provenance)
 *   - top 5 nearby sales
 *   - top 5 picked agents (with contact info)
 *   - top 5 recent activity events
 *   - counts across every dimension
 *
 * Bounded — /leads/[id] is still the source of truth for the deep-
 * dive editing workflow.
 */

const PREVIEW_LIMIT = 5;

export type LeadPreview = {
  lead: Lead;
  property: PropertyFacts | null;
  picked_agents: Agent[];
  suggested_agents: Agent[];
  candidates: AgentCandidate[];
  comparables: Comparable[];
  activity: ActivityEvent[];
  counts: {
    picked_agents: number;
    suggested_agents: number;
    candidates: number;
    comparables: number;
    activity: number;
  };
};

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;

  if (!isDemoMode()) {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ error: "unauthenticated" }, { status: 401 });
    }
  }

  const [lead, property, comps, shortlist, candidates, activity] =
    await Promise.all([
      getLead(id),
      getPropertyForLead(id),
      listComparablesForLead(id),
      getShortlistForLead(id),
      listCandidatesForLead(id),
      listActivityForLead(id),
    ]);
  if (!lead) return Response.json({ error: "not_found" }, { status: 404 });

  const pickedEntries = shortlist.filter((e) => e.pick !== null);

  const preview: LeadPreview = {
    lead,
    property: property?.facts ?? null,
    picked_agents: [...pickedEntries]
      .sort(
        (a, b) => (a.pick?.displayOrder ?? 0) - (b.pick?.displayOrder ?? 0)
      )
      .slice(0, PREVIEW_LIMIT)
      .map((e) => e.agent),
    // "Suggested" is the full shortlist (picked + unpicked) — what the
    // pill count reflects and what the operator wants to see inline.
    suggested_agents: shortlist.slice(0, PREVIEW_LIMIT).map((e) => e.agent),
    candidates: candidates.slice(0, PREVIEW_LIMIT),
    comparables: [...comps]
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, PREVIEW_LIMIT),
    activity: [...activity]
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, PREVIEW_LIMIT),
    counts: {
      picked_agents: pickedEntries.length,
      suggested_agents: shortlist.length,
      candidates: candidates.length,
      comparables: comps.length,
      activity: activity.length,
    },
  };
  return Response.json(preview);
}
