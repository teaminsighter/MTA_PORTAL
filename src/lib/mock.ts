import leadsJson from "@/mock/leads.json";
import propertiesJson from "@/mock/properties.json";
import comparablesJson from "@/mock/comparables.json";
import agentsJson from "@/mock/agents.json";
import agentCandidatesJson from "@/mock/agent_candidates.json";
import outcomesJson from "@/mock/outcomes.json";
import kpisJson from "@/mock/kpis.json";
import activityJson from "@/mock/activity.json";

/* ================================================================== */
/* Types                                                              */
/* ================================================================== */

export type LeadState =
  | "received"
  | "enriching"
  | "ready_for_review"
  | "dispatching"
  | "sent"
  | "partial_send"
  | "awaiting_agent_responses"
  | "agent_appointed"
  | "listed"
  | "sold"
  | "empty_workspace";

export type LeadSource =
  | "web"
  | "ac_import"
  | "ac_manual"
  | "seed_placeholder";

export interface Lead {
  id: string;
  address: string;
  vendor_name: string;
  phone: string;
  email: string;
  state: LeadState;
  source: LeadSource;
  created_at: string;
}

export interface Provenance<T> {
  value: T;
  source: string;
  fetched_at: string;
  unit?: string;
}

export interface PropertyFacts {
  cv?: Provenance<number>;
  land_value?: Provenance<number>;
  improvements?: Provenance<number>;
  estimate?: Provenance<number>;
  land_area?: Provenance<number>;
  floor_area?: Provenance<number>;
  bedrooms?: Provenance<number>;
  year_built?: Provenance<number>;
  last_sold_date?: Provenance<string>;
  last_sold_price?: Provenance<number>;
}

export interface Comparable {
  address: string;
  sale_price: number;
  sale_date: string;
  distance_m: number;
  cv_at_sale: number;
  agent_name: string;
  agency: string;
}

export type MembershipStatus = "signed" | "verbally_agreed" | "not_signed";

export interface Agent {
  id: string;
  name: string;
  agency: string;
  phone: string;
  email: string;
  membership_status: MembershipStatus;
  sms_permission: boolean;
  sales_last_12mo: number;
  avg_days_on_market: number;
  nearby_sales: number;
  reason_hint: string;
}

export interface AgentCandidate {
  id: string;
  name: string;
  agency: string;
  phone: string;
  email: string;
  first_seen_lead_id: string;
  confidence: "high" | "medium" | "low";
  reason_hint: string;
}

export interface Outcome {
  lead_id: string;
  outcome: string;
  winning_agent: string | null;
  sale_price: number | null;
  referral_amount: number | null;
  recorded_at: string;
}

export interface Kpis {
  leads_this_month: number;
  avg_time_to_send_min: number;
  agent_acceptance_pct: number;
  pending_partial_sends: number;
  sync_conflicts: number;
  canary_status: "green" | "yellow" | "red";
  referral_revenue_mtd: number;
}

export type ActivityType =
  | "lead_received"
  | "enrichment_done"
  | "ac_sync_out"
  | "ac_sync_in"
  | "send"
  | "delivery"
  | "state_change"
  | "vendor_open";

export interface ActivityEvent {
  type: ActivityType;
  at: string;
  detail: string;
}

/* ================================================================== */
/* Loaders                                                            */
/* ================================================================== */

export const leads = leadsJson as Lead[];
export const properties = propertiesJson as Record<string, PropertyFacts>;
export const comparables = comparablesJson as Record<string, Comparable[]>;
export const agents = agentsJson as Agent[];
export const agentCandidates = agentCandidatesJson as AgentCandidate[];
export const outcomes = outcomesJson as Outcome[];
export const kpis = kpisJson as Kpis;
export const activity = activityJson as Record<string, ActivityEvent[]>;

export function getLead(id: string): Lead | undefined {
  return leads.find((l) => l.id === id);
}

export function getProperty(id: string): PropertyFacts | undefined {
  return properties[id];
}

export function getComparables(id: string): Comparable[] {
  return comparables[id] ?? [];
}

export function getActivity(id: string): ActivityEvent[] {
  return activity[id] ?? [];
}

export function getCandidatesForLead(id: string): AgentCandidate[] {
  return agentCandidates.filter((c) => c.first_seen_lead_id === id);
}

/**
 * Deterministic shortlist for demo — return the top 3 signed/verbally_agreed
 * agents ordered by nearby_sales.
 */
export function getShortlistForLead(_id: string): Agent[] {
  return [...agents]
    .filter(
      (a) =>
        a.membership_status === "signed" ||
        a.membership_status === "verbally_agreed"
    )
    .sort((a, b) => b.nearby_sales - a.nearby_sales)
    .slice(0, 4);
}
