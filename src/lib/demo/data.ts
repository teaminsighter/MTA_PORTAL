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
import { agentRating } from "@/lib/lead/agent-rating";
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

export function demoGetNextLead(currentPublicId: string): Lead | null {
  const list = demoListLeads();
  const idx = list.findIndex((l) => l.id === currentPublicId);
  if (idx === -1) return list[0] ?? null;
  return list[idx + 1] ?? list[0] ?? null;
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

/*
 * Demo picks live in-process so ticks survive router.refresh(). Keyed
 * by publicLeadId → Map<agentId, {order, version}>. Order preserves
 * the sequence Sarah ticked; version bumps on each mutation. Wipes on
 * dev-server restart, which is exactly what we want for a demo.
 */
type DemoPick = { order: number; version: number };
const demoPicksByLead = new Map<string, Map<string, DemoPick>>();

function ensureLeadPicks(publicLeadId: string): Map<string, DemoPick> {
  let map = demoPicksByLead.get(publicLeadId);
  if (!map) {
    // Seed the top 3 as "picked" the first time this lead is opened so
    // the workspace demos the picked-to-top ordering out of the box.
    map = new Map();
    const seed = topShortlistAgents().slice(0, 3);
    seed.forEach((agent, i) => {
      map!.set(agent.id, { order: i, version: 1 });
    });
    demoPicksByLead.set(publicLeadId, map);
  }
  return map;
}

function topShortlistAgents(): Agent[] {
  return [...agentsData]
    .filter(
      (a) =>
        a.membership_status === "signed" ||
        a.membership_status === "verbally_agreed"
    )
    .sort((a, b) => {
      // Rating first (blends throughput + speed + locality). Nearby
      // sales as a tiebreaker keeps the ordering stable when two
      // agents land on the same rating.
      const rd = agentRating(b) - agentRating(a);
      if (rd !== 0) return rd;
      return b.nearby_sales - a.nearby_sales;
    })
    .slice(0, 6);
}

export function demoGetShortlistForLead(
  publicLeadId: string
): ShortlistEntry[] {
  const picks = ensureLeadPicks(publicLeadId);
  return topShortlistAgents().map((agent) => {
    const pick = picks.get(agent.id);
    return {
      agent,
      pick: pick
        ? {
            reasonNote: agent.reason_hint,
            version: pick.version,
            displayOrder: pick.order,
          }
        : null,
    };
  });
}

export function demoPickAgent(
  publicLeadId: string,
  agentId: string
): { version: number; displayOrder: number } {
  const picks = ensureLeadPicks(publicLeadId);
  const existing = picks.get(agentId);
  if (existing) {
    const bumped = { order: existing.order, version: existing.version + 1 };
    picks.set(agentId, bumped);
    return { version: bumped.version, displayOrder: bumped.order };
  }
  const nextOrder =
    picks.size === 0
      ? 0
      : Math.max(...Array.from(picks.values()).map((p) => p.order)) + 1;
  picks.set(agentId, { order: nextOrder, version: 1 });
  return { version: 1, displayOrder: nextOrder };
}

export function demoUnpickAgent(
  publicLeadId: string,
  agentId: string
): { version: number } {
  const picks = ensureLeadPicks(publicLeadId);
  const existing = picks.get(agentId);
  picks.delete(agentId);
  return { version: (existing?.version ?? 0) + 1 };
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
