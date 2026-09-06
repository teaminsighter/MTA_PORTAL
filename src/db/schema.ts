/*
 * MTA D1 schema — every table in PLAN-v4 §4.
 *
 * Conventions:
 *   - Every writable business table carries `version INTEGER NOT NULL DEFAULT 1`.
 *     Updates use `WHERE id = ? AND version = ?` and increment; zero rows
 *     affected = 409, UI asks to refresh.
 *   - Enums are TEXT + CHECK. Types are enforced in Drizzle via `{ enum: [...] }`
 *     for type inference, and at the DB via table-level check() constraints.
 *   - Timestamps are TEXT (ISO 8601). Defaults use CURRENT_TIMESTAMP so
 *     SQLite handles insertion without a client round-trip.
 *   - Foreign keys are declared but SQLite requires PRAGMA foreign_keys=ON
 *     to enforce; miniflare enables it by default.
 */

import { sql } from "drizzle-orm";
import {
  check,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

/* ================================================================== */
/* Enum literals                                                       */
/* ================================================================== */

export const LEAD_STATES = [
  "received",
  "enriching",
  "ready_for_review",
  "dispatching",
  "sent",
  "partial_send",
  "awaiting_agent_responses",
  "agent_appointed",
  "listed",
  "sold",
] as const;

export const LEAD_SOURCES = ["web", "ac_import", "ac_manual"] as const;

export const MEMBERSHIP_STATUSES = [
  "signed",
  "verbally_agreed",
  "not_signed",
] as const;

export const CANDIDATE_STATUSES = [
  "new",
  "contacted",
  "promoted",
  "dismissed",
] as const;

export const CANDIDATE_CONFIDENCES = ["high", "medium", "low"] as const;

export const CONTACT_CHANNELS = ["call", "email", "sms"] as const;

export const NOTIFICATION_STATUSES = [
  "pending",
  "sent",
  "accepted",
  "declined",
] as const;

export const OUTCOMES = [
  "no_response",
  "agent_appointed",
  "listed",
  "sold",
  "referral_invoiced",
  "referral_paid",
  "lost",
] as const;

export const USER_ROLES = ["consultant", "admin", "readonly"] as const;

export const AC_ENTITY_TYPES = ["lead", "contact", "agent"] as const;

export const SYNC_EVENT_STATUSES = [
  "pending",
  "applied",
  "skipped",
  "failed",
] as const;

export const DISPATCH_JOB_STATUSES = [
  "pending",
  "locked",
  "failed_retry",
  "sent",
  "partial_send",
  "replacement_required",
] as const;

export const DISPATCH_STEP_TYPES = [
  "vendor_email",
  "agent_email",
  "agent_sms",
  "ac_contact_upsert",
  "ac_deal_create",
  "ac_deal_stage_update",
  "ac_deal_note",
  "ac_outcome_update",
] as const;

export const DISPATCH_STEP_STATUSES = [
  "pending",
  "in_progress",
  "sent",
  "failed",
  "skipped",
] as const;

export const DELIVERY_STATUSES = [
  "queued",
  "delivered",
  "bounced",
  "opened",
  "clicked",
  "failed",
] as const;

/* Small helper: `CURRENT_TIMESTAMP` for text-typed created/updated cols. */
const NOW = sql`CURRENT_TIMESTAMP`;

/* ================================================================== */
/* Core                                                                */
/* ================================================================== */

export const leads = sqliteTable(
  "leads",
  {
    id: text("id").primaryKey(),
    // Public reference like "MTA-2026-00421".
    d1_lead_id: text("d1_lead_id").notNull(),
    address_raw: text("address_raw").notNull(),
    address_normalised: text("address_normalised").notNull(),
    vendor_name: text("vendor_name").notNull(),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    source: text("source", { enum: LEAD_SOURCES }).notNull(),
    state: text("state", { enum: LEAD_STATES }).notNull(),
    version: integer("version").notNull().default(1),
    created_at: text("created_at").notNull().default(NOW),
    updated_at: text("updated_at").notNull().default(NOW),
    webhook_idempotency_key: text("webhook_idempotency_key"),
  },
  (t) => [
    uniqueIndex("leads_d1_lead_id_unique").on(t.d1_lead_id),
    uniqueIndex("leads_webhook_idempotency_key_unique")
      .on(t.webhook_idempotency_key)
      .where(sql`${t.webhook_idempotency_key} IS NOT NULL`),
    index("leads_state_idx").on(t.state),
    index("leads_created_at_idx").on(t.created_at),
    check(
      "leads_source_check",
      sql`${t.source} IN ('web', 'ac_import', 'ac_manual')`
    ),
    check(
      "leads_state_check",
      sql`${t.state} IN ('received','enriching','ready_for_review','dispatching','sent','partial_send','awaiting_agent_responses','agent_appointed','listed','sold')`
    ),
  ]
);

export const properties = sqliteTable(
  "properties",
  {
    lead_id: text("lead_id")
      .primaryKey()
      .references(() => leads.id, { onDelete: "cascade" }),
    cv: integer("cv"),
    cv_source: text("cv_source"),
    cv_fetched_at: text("cv_fetched_at"),
    land_value: integer("land_value"),
    land_value_source: text("land_value_source"),
    land_value_fetched_at: text("land_value_fetched_at"),
    improvements: integer("improvements"),
    improvements_source: text("improvements_source"),
    improvements_fetched_at: text("improvements_fetched_at"),
    estimate: integer("estimate"),
    estimate_source: text("estimate_source"),
    estimate_fetched_at: text("estimate_fetched_at"),
    land_area: integer("land_area"),
    land_area_source: text("land_area_source"),
    land_area_fetched_at: text("land_area_fetched_at"),
    floor_area: integer("floor_area"),
    floor_area_source: text("floor_area_source"),
    floor_area_fetched_at: text("floor_area_fetched_at"),
    bedrooms: integer("bedrooms"),
    bedrooms_source: text("bedrooms_source"),
    bedrooms_fetched_at: text("bedrooms_fetched_at"),
    year_built: integer("year_built"),
    year_built_source: text("year_built_source"),
    year_built_fetched_at: text("year_built_fetched_at"),
    last_sold_date: text("last_sold_date"),
    last_sold_date_source: text("last_sold_date_source"),
    last_sold_date_fetched_at: text("last_sold_date_fetched_at"),
    last_sold_price: integer("last_sold_price"),
    last_sold_price_source: text("last_sold_price_source"),
    last_sold_price_fetched_at: text("last_sold_price_fetched_at"),
    version: integer("version").notNull().default(1),
    updated_at: text("updated_at").notNull().default(NOW),
  }
);

export const property_comparables = sqliteTable(
  "property_comparables",
  {
    id: text("id").primaryKey(),
    lead_id: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    sale_price: integer("sale_price").notNull(),
    sale_date: text("sale_date").notNull(),
    distance_m: integer("distance_m").notNull().default(0),
    cv_at_sale: integer("cv_at_sale").notNull().default(0),
    agent_name_raw: text("agent_name_raw"),
    agency_raw: text("agency_raw"),
    matched_agent_id: text("matched_agent_id"),
    source: text("source").notNull(),
    fetched_at: text("fetched_at").notNull().default(NOW),
  },
  (t) => [index("comparables_lead_idx").on(t.lead_id)]
);

export const agents = sqliteTable(
  "agents",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    agency: text("agency").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    membership_status: text("membership_status", {
      enum: MEMBERSHIP_STATUSES,
    }).notNull(),
    sms_permission: integer("sms_permission", { mode: "boolean" })
      .notNull()
      .default(false),
    sms_consent_at: text("sms_consent_at"),
    sms_consent_method: text("sms_consent_method"),
    signed_at: text("signed_at"),
    signed_by: text("signed_by"),
    notes: text("notes"),
    // Denormalised stats for Phase 1 — will become derived in Phase 4/5
    // when real dispatch + outcome data is flowing.
    sales_last_12mo: integer("sales_last_12mo").notNull().default(0),
    avg_days_on_market: integer("avg_days_on_market").notNull().default(0),
    nearby_sales: integer("nearby_sales").notNull().default(0),
    reason_hint: text("reason_hint"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    version: integer("version").notNull().default(1),
    created_at: text("created_at").notNull().default(NOW),
    updated_at: text("updated_at").notNull().default(NOW),
  },
  (t) => [
    index("agents_active_idx").on(t.active),
    check(
      "agents_membership_check",
      sql`${t.membership_status} IN ('signed','verbally_agreed','not_signed')`
    ),
  ]
);

export const agent_candidates = sqliteTable(
  "agent_candidates",
  {
    id: text("id").primaryKey(),
    name_raw: text("name_raw").notNull(),
    name_normalised: text("name_normalised").notNull(),
    agency: text("agency").notNull().default(""),
    phone: text("phone").notNull().default(""),
    email: text("email").notNull().default(""),
    source: text("source").notNull(),
    first_seen_lead_id: text("first_seen_lead_id").references(() => leads.id, {
      onDelete: "set null",
    }),
    match_agent_id: text("match_agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    confidence: text("confidence", { enum: CANDIDATE_CONFIDENCES }).notNull(),
    status: text("status", { enum: CANDIDATE_STATUSES })
      .notNull()
      .default("new"),
    reason_hint: text("reason_hint"),
    version: integer("version").notNull().default(1),
    created_at: text("created_at").notNull().default(NOW),
    updated_at: text("updated_at").notNull().default(NOW),
  },
  (t) => [
    index("candidates_status_idx").on(t.status),
    check(
      "candidates_confidence_check",
      sql`${t.confidence} IN ('high','medium','low')`
    ),
    check(
      "candidates_status_check",
      sql`${t.status} IN ('new','contacted','promoted','dismissed')`
    ),
  ]
);

export const agent_contact_log = sqliteTable(
  "agent_contact_log",
  {
    id: text("id").primaryKey(),
    agent_id: text("agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    candidate_id: text("candidate_id").references(() => agent_candidates.id, {
      onDelete: "set null",
    }),
    lead_id: text("lead_id").references(() => leads.id, {
      onDelete: "set null",
    }),
    channel: text("channel", { enum: CONTACT_CHANNELS }).notNull(),
    outcome: text("outcome"),
    note: text("note"),
    by_user: text("by_user"),
    at: text("at").notNull().default(NOW),
  },
  (t) => [
    check(
      "contact_log_channel_check",
      sql`${t.channel} IN ('call','email','sms')`
    ),
  ]
);

export const lead_agent_picks = sqliteTable(
  "lead_agent_picks",
  {
    id: text("id").primaryKey(),
    lead_id: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    agent_id: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    reason_note: text("reason_note"),
    display_order: integer("display_order").notNull().default(0),
    picked_by: text("picked_by"),
    picked_at: text("picked_at").notNull().default(NOW),
    unpicked_at: text("unpicked_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    uniqueIndex("picks_lead_agent_unique").on(t.lead_id, t.agent_id),
  ]
);

export const agent_notification_status = sqliteTable(
  "agent_notification_status",
  {
    lead_id: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    agent_id: text("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    status: text("status", { enum: NOTIFICATION_STATUSES }).notNull(),
    updated_at: text("updated_at").notNull().default(NOW),
  },
  (t) => [
    primaryKey({ columns: [t.lead_id, t.agent_id] }),
    check(
      "notif_status_check",
      sql`${t.status} IN ('pending','sent','accepted','declined')`
    ),
  ]
);

export const lead_outcomes = sqliteTable(
  "lead_outcomes",
  {
    id: text("id").primaryKey(),
    lead_id: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    outcome: text("outcome", { enum: OUTCOMES }).notNull(),
    winning_agent_id: text("winning_agent_id").references(() => agents.id, {
      onDelete: "set null",
    }),
    // Denormalised for display when the agent doesn't exist in our table
    // (e.g. historical AC imports before we had a matching agents row).
    winning_agent_name: text("winning_agent_name"),
    sale_price: integer("sale_price"),
    referral_amount: integer("referral_amount"),
    recorded_by: text("recorded_by"),
    recorded_at: text("recorded_at").notNull().default(NOW),
    ac_synced_at: text("ac_synced_at"),
  },
  (t) => [
    index("outcomes_lead_idx").on(t.lead_id),
    index("outcomes_recorded_idx").on(t.recorded_at),
    check(
      "outcomes_check",
      sql`${t.outcome} IN ('no_response','agent_appointed','listed','sold','referral_invoiced','referral_paid','lost')`
    ),
  ]
);

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name").notNull().default(""),
    google_sub: text("google_sub"),
    role: text("role", { enum: USER_ROLES }).notNull().default("readonly"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    created_at: text("created_at").notNull().default(NOW),
    last_login_at: text("last_login_at"),
    version: integer("version").notNull().default(1),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(t.email),
    check(
      "users_role_check",
      sql`${t.role} IN ('consultant','admin','readonly')`
    ),
  ]
);

/* ================================================================== */
/* Sync                                                                */
/* ================================================================== */

export const ac_sync_map = sqliteTable(
  "ac_sync_map",
  {
    id: text("id").primaryKey(),
    entity_type: text("entity_type", { enum: AC_ENTITY_TYPES }).notNull(),
    d1_id: text("d1_id").notNull(),
    ac_id: text("ac_id").notNull(),
    last_pushed_at: text("last_pushed_at"),
    last_pulled_at: text("last_pulled_at"),
    last_hash: text("last_hash"),
  },
  (t) => [
    uniqueIndex("sync_map_entity_ac_unique").on(t.entity_type, t.ac_id),
    check(
      "sync_map_entity_check",
      sql`${t.entity_type} IN ('lead','contact','agent')`
    ),
  ]
);

export const sync_events = sqliteTable(
  "sync_events",
  {
    id: text("id").primaryKey(),
    ac_event_id: text("ac_event_id").notNull(),
    event_type: text("event_type").notNull(),
    ac_entity_id: text("ac_entity_id").notNull(),
    payload_json: text("payload_json").notNull(),
    received_at: text("received_at").notNull().default(NOW),
    applied_at: text("applied_at"),
    status: text("status", { enum: SYNC_EVENT_STATUSES })
      .notNull()
      .default("pending"),
    error: text("error"),
  },
  (t) => [
    uniqueIndex("sync_events_ac_event_unique").on(t.ac_event_id),
    check(
      "sync_events_status_check",
      sql`${t.status} IN ('pending','applied','skipped','failed')`
    ),
  ]
);

export const sync_conflicts = sqliteTable(
  "sync_conflicts",
  {
    id: text("id").primaryKey(),
    lead_id: text("lead_id").references(() => leads.id, {
      onDelete: "cascade",
    }),
    field: text("field").notNull(),
    d1_value: text("d1_value"),
    ac_value: text("ac_value"),
    detected_at: text("detected_at").notNull().default(NOW),
    resolved_by: text("resolved_by"),
    resolution: text("resolution"),
  }
);

/* ================================================================== */
/* Dispatch  (§6)                                                      */
/* ================================================================== */

export const dispatch_jobs = sqliteTable(
  "dispatch_jobs",
  {
    id: text("id").primaryKey(),
    lead_id: text("lead_id")
      .notNull()
      .references(() => leads.id, { onDelete: "cascade" }),
    expected_lead_version: integer("expected_lead_version").notNull(),
    status: text("status", { enum: DISPATCH_JOB_STATUSES })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    locked_by: text("locked_by"),
    locked_at: text("locked_at"),
    lease_expires_at: text("lease_expires_at"),
    next_attempt_at: text("next_attempt_at").notNull().default(NOW),
    created_at: text("created_at").notNull().default(NOW),
    updated_at: text("updated_at").notNull().default(NOW),
  },
  (t) => [
    index("jobs_status_next_idx").on(t.status, t.next_attempt_at),
    check(
      "jobs_status_check",
      sql`${t.status} IN ('pending','locked','failed_retry','sent','partial_send','replacement_required')`
    ),
  ]
);

export const dispatch_steps = sqliteTable(
  "dispatch_steps",
  {
    id: text("id").primaryKey(),
    job_id: text("job_id")
      .notNull()
      .references(() => dispatch_jobs.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    step_type: text("step_type", { enum: DISPATCH_STEP_TYPES }).notNull(),
    parallel: integer("parallel", { mode: "boolean" }).notNull().default(false),
    depends_on_seq: integer("depends_on_seq"),
    idempotency_key: text("idempotency_key"),
    status: text("status", { enum: DISPATCH_STEP_STATUSES })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    last_error: text("last_error"),
    payload_json: text("payload_json"),
    created_at: text("created_at").notNull().default(NOW),
    updated_at: text("updated_at").notNull().default(NOW),
  },
  (t) => [
    uniqueIndex("steps_job_seq_unique").on(t.job_id, t.seq),
    check(
      "steps_status_check",
      sql`${t.status} IN ('pending','in_progress','sent','failed','skipped')`
    ),
    check(
      "steps_type_check",
      sql`${t.step_type} IN ('vendor_email','agent_email','agent_sms','ac_contact_upsert','ac_deal_create','ac_deal_stage_update','ac_deal_note','ac_outcome_update')`
    ),
  ]
);

export const deliveries = sqliteTable(
  "deliveries",
  {
    id: text("id").primaryKey(),
    step_id: text("step_id")
      .notNull()
      .references(() => dispatch_steps.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    provider_message_id: text("provider_message_id"),
    recipient: text("recipient").notNull(),
    status: text("status", { enum: DELIVERY_STATUSES })
      .notNull()
      .default("queued"),
    delivered_at: text("delivered_at"),
    opened_at: text("opened_at"),
    clicked_at: text("clicked_at"),
    failed_at: text("failed_at"),
    error: text("error"),
    created_at: text("created_at").notNull().default(NOW),
  }
);

export const template_versions = sqliteTable(
  "template_versions",
  {
    id: text("id").primaryKey(),
    template_key: text("template_key").notNull(),
    version: integer("version").notNull(),
    subject: text("subject"),
    body: text("body").notNull(),
    created_at: text("created_at").notNull().default(NOW),
  },
  (t) => [
    uniqueIndex("templates_key_version_unique").on(t.template_key, t.version),
  ]
);

/* ================================================================== */
/* Audit                                                               */
/* ================================================================== */

export const audit_log = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    action: text("action").notNull(),
    actor_user_id: text("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    entity_type: text("entity_type").notNull(),
    entity_id: text("entity_id"),
    lead_id: text("lead_id").references(() => leads.id, {
      onDelete: "set null",
    }),
    before_json: text("before_json"),
    after_json: text("after_json"),
    at: text("at").notNull().default(NOW),
  },
  (t) => [
    index("audit_lead_at_idx").on(t.lead_id, t.at),
    index("audit_entity_idx").on(t.entity_type, t.entity_id),
  ]
);
