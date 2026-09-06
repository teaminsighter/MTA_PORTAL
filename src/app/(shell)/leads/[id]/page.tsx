export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import LeadWorkspace from "./LeadWorkspace";
import { getLead } from "@/lib/repo/leads";
import { getPropertyForLead } from "@/lib/repo/properties";
import { listComparablesForLead } from "@/lib/repo/comparables";
import { getShortlistForLead } from "@/lib/repo/agents";
import { listCandidatesForLead } from "@/lib/repo/candidates";
import { listActivityForLead } from "@/lib/repo/activity";

interface LeadPageProps {
  params: Promise<{ id: string }>;
}

export default async function LeadPage({ params }: LeadPageProps) {
  const { id } = await params;
  const [lead, property, comps, shortlist, candidates, activity] =
    await Promise.all([
      getLead(id),
      getPropertyForLead(id),
      listComparablesForLead(id),
      getShortlistForLead(id),
      listCandidatesForLead(id),
      listActivityForLead(id),
    ]);
  if (!lead) notFound();

  return (
    <LeadWorkspace
      lead={lead}
      property={property}
      comps={comps}
      shortlist={shortlist}
      candidates={candidates}
      activity={activity}
    />
  );
}
