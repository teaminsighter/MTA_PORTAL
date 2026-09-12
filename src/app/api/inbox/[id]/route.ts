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
import type { Lead, PropertyFacts } from "@/lib/mock";

/*
 * GET /api/inbox/[id] — quick preview payload for the inbox right
 * pane. Everything Sarah needs to decide whether to open the full
 * workspace: headline property numbers, pick counts, activity count,
 * comparables count. Deliberately trimmer than /leads/[id] so the
 * preview loads fast on hover / click.
 */

export type LeadPreview = {
  lead: Lead;
  property: PropertyFacts | null;
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

  const preview: LeadPreview = {
    lead,
    property: property?.facts ?? null,
    counts: {
      picked_agents: shortlist.filter((e) => e.pick !== null).length,
      suggested_agents: shortlist.length,
      candidates: candidates.length,
      comparables: comps.length,
      activity: activity.length,
    },
  };
  return Response.json(preview);
}
