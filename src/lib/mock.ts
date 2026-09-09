/* ================================================================== */
/* Shared domain types.                                                */
/*                                                                     */
/* Historically this file also exported the mock JSON fixtures and    */
/* helper loaders for the demo UI. The pages and components now read  */
/* everything from src/lib/repo/* (D1-backed), so only the type        */
/* exports remain. The seed script talks to src/mock/*.json directly.  */
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
  /** DB row version; present on records read from D1. */
  version?: number;
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
  /**
   * DB row version. Present on records read from D1; used by server
   * actions for optimistic-concurrency updates. Optional so mock
   * fixtures without version tracking still type-check.
   */
  version?: number;
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

