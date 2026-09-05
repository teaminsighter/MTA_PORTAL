import { notFound } from "next/navigation";
import LeadWorkspace from "./LeadWorkspace";
import {
  getActivity,
  getCandidatesForLead,
  getComparables,
  getLead,
  getProperty,
  getShortlistForLead,
} from "@/lib/mock";

interface LeadPageProps {
  params: Promise<{ id: string }>;
}

export default async function LeadPage({ params }: LeadPageProps) {
  const { id } = await params;
  const lead = getLead(id);
  if (!lead) notFound();

  const property = getProperty(id);
  const comps = getComparables(id);
  const shortlist = getShortlistForLead(id);
  const candidates = getCandidatesForLead(id);
  const activity = getActivity(id);

  return (
    <LeadWorkspace
      lead={lead}
      property={property ?? null}
      comps={comps}
      shortlist={shortlist}
      candidates={candidates}
      activity={activity}
    />
  );
}
