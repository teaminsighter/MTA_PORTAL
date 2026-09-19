export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import LeadWorkspace from "./LeadWorkspace";
import { auth } from "@/lib/auth";
import { getLead, getLeadRow, getNextLead } from "@/lib/repo/leads";
import { getPropertyForLead } from "@/lib/repo/properties";
import { listComparablesForLead } from "@/lib/repo/comparables";
import { getShortlistForLead } from "@/lib/repo/agents";
import { listCandidatesForLead } from "@/lib/repo/candidates";
import { listActivityForLead } from "@/lib/repo/activity";
import { autoAdvanceIfReady } from "@/lib/leads/auto-advance";

interface LeadPageProps {
  params: Promise<{ id: string }>;
}

export default async function LeadPage({ params }: LeadPageProps) {
  const { id } = await params;
  const [lead, property, comps, shortlist, candidates, activity, nextLead] =
    await Promise.all([
      getLead(id),
      getPropertyForLead(id),
      listComparablesForLead(id),
      getShortlistForLead(id),
      listCandidatesForLead(id),
      listActivityForLead(id),
      getNextLead(id),
    ]);
  if (!lead) notFound();

  /*
   * Auto-advance: if the lead is still in `received`, the property has
   * a CV, and at least one agent is picked, walk it through
   * received → enriching → ready_for_review. Runs inside the RSC so
   * the stepper renders the new state on this same request — the
   * user sees the pill light up on load, not on the next refresh.
   */
  const row = await getLeadRow(id);
  const session = await auth();
  let finalLead = lead;
  if (row && lead.state === "received") {
    const hasCv = property?.facts.cv?.value != null;
    const hasPickedAgent = shortlist.some((e) => e.pick !== null);
    if (hasCv && hasPickedAgent) {
      const advance = await autoAdvanceIfReady({
        leadRowId: row.id,
        currentState: row.state,
        currentVersion: row.version,
        hasCv,
        hasPickedAgent,
        actorUserId: session?.user?.id ?? null,
      });
      if (advance.advanced) {
        // Re-fetch the projected Lead so LeadWorkspace + the stepper
        // render the fresh state on this request.
        const refreshed = await getLead(id);
        if (refreshed) finalLead = refreshed;
      }
    }
  }

  return (
    <LeadWorkspace
      lead={finalLead}
      property={property}
      comps={comps}
      shortlist={shortlist}
      candidates={candidates}
      activity={activity}
      nextLead={nextLead}
    />
  );
}
