import leadsJson from "@/mock/leads.json";
import propertiesJson from "@/mock/properties.json";
import comparablesJson from "@/mock/comparables.json";
import agentsJson from "@/mock/agents.json";
import agentCandidatesJson from "@/mock/agent_candidates.json";
import outcomesJson from "@/mock/outcomes.json";
import kpisJson from "@/mock/kpis.json";
import activityJson from "@/mock/activity.json";
import type {
  ActivityEvent,
  Agent,
  AgentCandidate,
  Comparable,
  Kpis,
  Lead,
  Outcome,
  PropertyFacts,
} from "@/lib/mock";
import type { PropertyBundle } from "@/lib/repo/properties";
import type { ShortlistEntry } from "@/lib/repo/agents";

/*
 * In-process mock loaders used ONLY when DEMO_MODE=1.
 *
 * Every repo function in production has a demo counterpart here with
 * the identical return shape. Pages don't know which is running — a
 * top-of-function isDemoMode() check in each repo picks the branch.
 *
 * Nothing here writes; the client walkthrough is read-only from the
 * DB's perspective. Server actions in demo mode use their own no-op
 * success responses (see src/app/actions/*.ts).
 */

const leadsData = leadsJson as Lead[];
const propertiesData = propertiesJson as Record<string, PropertyFacts>;
const comparablesData = comparablesJson as Record<string, Comparable[]>;
const agentsData = agentsJson as Agent[];
const candidatesData = agentCandidatesJson as AgentCandidate[];
const outcomesData = outcomesJson as Outcome[];
const kpisData = kpisJson as Kpis;
const activityData = activityJson as Record<string, ActivityEvent[]>;

/* ---------------------- leads ---------------------- */

export function demoListLeads(): Lead[] {
  // Same ordering the DB uses: newest-first.
  return [...leadsData].sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
}

export function demoGetLead(publicId: string): Lead | null {
  return leadsData.find((l) => l.id === publicId) ?? null;
}

export function demoListRecentLeads(limit = 6): Lead[] {
  return demoListLeads().slice(0, limit);
}

/* ---------------------- property ---------------------- */

export function demoGetPropertyForLead(
  publicLeadId: string
): PropertyBundle | null {
  const facts = propertiesData[publicLeadId];
  if (!facts) return { facts: {}, version: 0 };
  return { facts, version: 1 };
}

/* ---------------------- comparables ---------------------- */

export function demoListComparablesForLead(
  publicLeadId: string
): Comparable[] {
  return comparablesData[publicLeadId] ?? [];
}

/* ---------------------- agents / shortlist ---------------------- */

export function demoListAgents(): Agent[] {
  return [...agentsData].sort(
    (a, b) => b.sales_last_12mo - a.sales_last_12mo
  );
}

export function demoCountSignedAgents(): number {
  return agentsData.filter((a) => a.membership_status === "signed").length;
}

export function demoGetShortlistForLead(
  _publicLeadId: string
): ShortlistEntry[] {
  // Top signed / verbally_agreed by nearby_sales — matches the Phase 1
  // shortlist heuristic. Seed the top 3 as "picked" with placeholder
  // reason notes so the workspace demos the picked-to-top ordering.
  const top = [...agentsData]
    .filter(
      (a) =>
        a.membership_status === "signed" ||
        a.membership_status === "verbally_agreed"
    )
    .sort((a, b) => b.nearby_sales - a.nearby_sales)
    .slice(0, 6);

  return top.map((agent, index) => {
    const picked = index < 3;
    return {
      agent,
      pick: picked
        ? {
            reasonNote: agent.reason_hint,
            version: 1,
            displayOrder: index,
          }
        : null,
    };
  });
}

/* ---------------------- candidates ---------------------- */

export function demoListCandidatesForLead(
  publicLeadId: string
): AgentCandidate[] {
  return candidatesData.filter((c) => c.first_seen_lead_id === publicLeadId);
}

/* ---------------------- activity / timeline ---------------------- */

export function demoListActivityForLead(
  publicLeadId: string
): ActivityEvent[] {
  return activityData[publicLeadId] ?? [];
}

/* ---------------------- outcomes ---------------------- */

export function demoListRecentOutcomes(limit = 12): Outcome[] {
  return [...outcomesData]
    .sort((a, b) => b.recorded_at.localeCompare(a.recorded_at))
    .slice(0, limit);
}

/* ---------------------- KPIs ---------------------- */

export function demoComputeKpis(): Kpis {
  return kpisData;
}
