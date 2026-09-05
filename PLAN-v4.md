# MTA Consultant Portal, Master Plan (v4)

> **Single source of truth for the My Top Agent portal build.**
> If Claude Code loses context, reload this file first. Do not build from memory.
> Last updated: 2026-09-05. Supersedes v3. See §18 for what changed and why.

---

## 0. TL;DR

MTA already runs on ActiveCampaign. Every past lead, vendor, deal and note lives there. v3 treated AC as an empty mirror. v4 treats it as the historical system that must be imported, matched and kept in two-way sync with the new portal database (D1). D1 is master after go-live. AC stays usable for the team, and any change made in AC flows back.

The portal then does four things for each lead: enrich the property from outside sources and show a comparison view, build an agent shortlist from MTA's own database plus agents who sold nearby but aren't signed yet, let Sarah pick and send in one action, and track what happened afterwards (accepted, listed, sold, referral paid).

Reliability is a feature, not a phase. Every phase ships behind tests, a staging gate and a daily canary. Nothing goes to production that hasn't run end-to-end on staging with real-shaped data.

| Item | Value |
|---|---|
| Client | Sean McArthur, My Top Agent NZ |
| Developer | Imran Hossain (teaminsighter@gmail.com) |
| Prod | `portal.mytopagent.co.nz` |
| Staging | `portal-staging.mytopagent.co.nz` |
| MVP timeline | 25 to 32 working days (Phases 0 to 7) |
| Post-MVP | Phases 8 and 9, 10 to 15 days, shipped as independent slices |
| Delivery target | Vendor and agent messages within 90s of Send |
| Outcome target | Sarah's time per lead from 15 to 20 min down to 5 to 6 min, and Sean can see conversion from lead to referral fee for the first time |

---

## 1. Context

### What MTA does
NZ service matching property vendors with the best local agent. Free for vendors. Agents pay MTA a referral fee when the sale closes.

### Today (15 to 20 min per lead, all manual)
1. Vendor submits address on mytopagent.co.nz. A worker pushes it to AC.
2. Sarah opens Cotality Property Guru, searches the address, notes CV, land, improvements.
3. Runs Cotality radius search, notes nearby sales and the selling agents.
4. Cross-checks each agent against MTA's signed list (currently spread between AC and a spreadsheet).
5. Unsigned agent: Sarah calls them and pitches MTA.
6. Drafts the vendor email with 2 or 3 recommendations.
7. Pastes into the AC deal, sends.
8. Separately emails and SMSes each agent.
9. Agent declines: swap, resend.
10. Outcome (listed, sold, fee paid) is tracked loosely in AC stages, if at all.

### After v4 MVP
1. Lead lands in the portal inbox within 90s, and in AC at the same time.
2. Sarah opens it. Property data is already fetched (or she pastes it if a source is down). She sees a comparison against nearby sales.
3. Shortlist is pre-built: signed MTA agents first, then nearby sellers not yet signed, with contact details where available.
4. She calls unsigned agents from the portal, logs the outcome, and signs them inline.
5. One Send. Vendor email, agent emails, agent SMS, AC updated. All tracked.
6. Declines and swaps handled in the portal. Outcomes recorded through to referral paid.
7. Anything Sean or Sarah changes in AC syncs back automatically.

### Reference assets
| Asset | Path |
|---|---|
| This plan | `/Volumes/Extra - HardDisk/AUTOMATION_MTA_SEAN/PLAN.md` |
| Workflow mockup | `/Volumes/Extra - HardDisk/AUTOMATION_MTA_SEAN/mta-workflow-mockup.html` |
| Client report | `/Volumes/Extra - HardDisk/AUTOMATION_MTA_SEAN/CLIENT-REPORT.md` |
| Teammate UI prototype | `/Users/macinsighter/Downloads/lead-page-prototype (1).html` |
| Cotality | `https://propertyguru.corelogic.co.nz/` |
| ActiveCampaign | `https://mytopagent.activehosted.com/` |

---

## 2. Confirmed decisions

| Area | Decision |
|---|---|
| Master database | Cloudflare D1. Master after go-live. |
| ActiveCampaign | Historical system of record before go-live. After go-live: kept in two-way sync. D1 wins on conflict. Team may keep working in AC for notes, stages and contacts. |
| Lead identity | Every lead carries a `d1_lead_id` stored in an AC deal custom field. That field is the join key. |
| Property data | Enrichment layer with adapters. Cotality is adapter #1. Others added only after a legal and technical spike. Manual paste always available as fallback and override. |
| Agent data | MTA `agents` table is master. Non-signed agents found via radius search live in `agent_candidates` until Sarah promotes them. |
| Email | Postmark direct. One message stream per environment. |
| SMS | TransmitSMS, NZ sender ID. Only to agents with recorded consent. |
| Auth | Google OAuth via Auth.js, `email_verified` required, `users` allowlist. |
| Roles | `consultant`, `admin`, `readonly`. |
| Lead visibility | All consultants see all leads. |
| Real-time | Polling every 15s plus refresh-on-focus. No SSE. |
| Hosting | Next.js 15 on Cloudflare Workers via OpenNext. |
| Mobile | First-class. Same app, responsive layout, thumb-reachable primary actions. Not a separate build. |
| Build style | Vertical slices. Every phase ends with a test gate and a staging soak. |
| Environments | local, staging, production. Three D1 databases, three sets of secrets, recipient allowlists on staging for email and SMS. |

---

## 3. Architecture

### The rule
> D1 is master. AC is a synced peer, not a mirror. Every write to D1 that AC cares about is pushed out through a dispatch step. Every change in AC is pulled in through webhooks and a nightly reconciliation. When both sides change the same field, D1 wins and the AC value is logged, not applied.

### System map
```
Landing page form ──► ingest worker ──► D1 (leads)
                                            │
AC webhooks ───────► sync-in worker ──► D1 (sync_events → apply)
                                            │
                                     ┌──────┴───────┐
                                     │  D1 (master) │
                                     └──────┬───────┘
                                            │
        ┌──────────────┬────────────────────┼────────────────┬───────────────┐
        ▼              ▼                    ▼                ▼               ▼
  Enrichment      Agent match          Dispatcher        Reconciler      Portal UI
  (Cotality +     (MTA agents +        (Postmark, AC     (nightly D1     (desktop +
   adapters)       candidates)          out, SMS)         vs AC diff)     mobile)
```

### Layers

**Ingest.** `/api/leads/webhook` verifies HMAC, dedupes on idempotency key, writes the lead, returns 200, fires the dispatcher best-effort. Cron every 60s catches misses.

**Sync-in.** AC webhooks (deal updated, deal stage changed, contact updated, note added) land in `sync_events`. A worker applies them to D1 using the `d1_lead_id` custom field to find the lead. Unknown deals (created directly in AC without a `d1_lead_id`) are imported as new leads with `source = ac_manual` and the ID is written back to AC. Events are applied in order per lead, idempotent on AC event ID.

**Sync-out.** Any D1 change that AC needs (new lead, stage change, agent picks as a note, outcome) becomes a `dispatch_step` of type `ac_*`. Same job model as email and SMS, so ordering and retries are handled once.

**Enrichment.** Adapter interface: `lookup(address) → PropertyFacts`, `comparables(address, radius) → Comparable[]`. Each adapter declares its fields, TTLs and rate limits. Results stored with provenance (`source`, `fetched_at`, `confidence`). Manual edits set `source = manual` and are never overwritten by a refresh.

**Agent match.** Comparables carry `selling_agent_name` and `agency`. Normalise the name, match against `agents` with a confidence score. High confidence links automatically. Medium and low become `agent_candidates` for Sarah to confirm, merge or dismiss.

**Dispatcher.** Unchanged from v3: `dispatch_jobs` plus ordered `dispatch_steps`, atomic conditional-update claim, finite retries with backoff, stale-version rejection, per-provider idempotency keys. See §6.

**Reconciler.** Nightly job compares D1 leads to AC deals by `d1_lead_id`. Flags missing, duplicate, stage mismatch, field drift. Result visible in admin dashboard and emailed to Sean if drift exceeds a threshold.

### Tech stack
| Layer | Choice |
|---|---|
| Framework | Next.js 15 App Router, OpenNext for Cloudflare Workers |
| Styling | Tailwind v4, design tokens in one file |
| Components | shadcn/ui on Radix |
| Server state | TanStack Query |
| Forms | React Hook Form + Zod, server validates everything again |
| DB | Cloudflare D1 + Drizzle ORM, forward-only migrations |
| Auth | Auth.js + Google |
| Scheduling | Cloudflare Cron: 1 min dispatcher, 5 min sync-in drain, nightly reconciler and canary |
| Email | Postmark |
| SMS | TransmitSMS |
| CRM | ActiveCampaign REST + webhooks |
| Property | Cotality (adapter), others behind flags |
| AI (Phase 9) | Anthropic Claude API |
| Logs | Structured JSON, Cloudflare Logs, Logpush to R2 for 30 days |
| Backups | D1 Time Travel (30 day PITR) plus nightly export to R2 |
| CI/CD | GitHub Actions: lint, typecheck, unit, integration with fixtures, deploy to staging on main, prod on tag |

---

## 4. Data model

Every writable business table has `version INTEGER NOT NULL DEFAULT 1`. All updates use `WHERE id = ? AND version = ?`. Zero rows means 409 and the UI asks the user to refresh.

### Core
| Table | Purpose |
|---|---|
| `leads` | id, `d1_lead_id` (public ref, e.g. `MTA-2026-00421`), address (raw + normalised), vendor_name, phone, email, source (`web`, `ac_import`, `ac_manual`), state, version, created_at, updated_at, webhook_idempotency_key |
| `properties` | lead_id, cv, land_value, improvements, estimate, land_area, floor_area, bedrooms, year_built, last_sold_date, last_sold_price, per-field `source` + `fetched_at`, version |
| `property_comparables` | lead_id, address, sale_price, sale_date, distance_m, cv_at_sale, agent_name_raw, agency_raw, matched_agent_id, source, fetched_at |
| `agents` | id, name, agency, phone, email, membership_status, sms_permission, sms_consent_at, sms_consent_method, signed_at, signed_by, notes, active, version |
| `agent_candidates` | id, name_raw, name_normalised, agency, phone, email, source, first_seen_lead_id, match_agent_id, confidence, status (`new`, `contacted`, `promoted`, `dismissed`), version |
| `agent_contact_log` | agent_id or candidate_id, lead_id, channel (`call`, `email`, `sms`), outcome, note, by_user, at |
| `lead_agent_picks` | lead_id, agent_id, reason_note, display_order, picked_by, picked_at, unpicked_at, version |
| `agent_notification_status` | lead_id, agent_id, status (`pending`, `sent`, `accepted`, `declined`), updated_at |
| `lead_outcomes` | lead_id, outcome (`no_response`, `agent_appointed`, `listed`, `sold`, `referral_invoiced`, `referral_paid`, `lost`), winning_agent_id, sale_price, referral_amount, recorded_by, recorded_at, ac_synced_at |
| `users` | id, email, name, google_sub, role, active, created_at, last_login_at, version |

### Sync
| Table | Purpose |
|---|---|
| `ac_sync_map` | entity_type (`lead`, `contact`, `agent`), d1_id, ac_id, last_pushed_at, last_pulled_at, last_hash |
| `sync_events` | id, ac_event_id (unique), event_type, ac_entity_id, payload_json, received_at, applied_at, status (`pending`, `applied`, `skipped`, `failed`), error |
| `sync_conflicts` | lead_id, field, d1_value, ac_value, detected_at, resolved_by, resolution |

### Dispatch (unchanged from v3)
`dispatch_jobs`, `dispatch_steps`, `deliveries`, `template_versions`. Step types now include `ac_contact_upsert`, `ac_deal_create`, `ac_deal_stage_update`, `ac_deal_note`, `ac_outcome_update`, `vendor_email`, `agent_email`, `agent_sms`.

### Audit
`audit_log` scoped to: auth events, role changes, agent and candidate create/edit/promote/dismiss, lead state transitions, sends, outcome edits, vendor PII edits, admin replays, sync conflict resolutions, exports. Not page views, not autosave keystrokes.

---

## 5. ActiveCampaign integration

### 5.1 One-time import (Phase 2)
1. Export all AC contacts, deals, deal custom fields, notes and pipeline stages via API to R2 as JSON.
2. Field mapping document signed off by Sean before any import runs. Every AC field either maps to a D1 column, goes into `leads.legacy_json`, or is explicitly dropped.
3. Import into staging D1 first. Produce a report: rows imported, rows skipped and why, duplicates merged and how.
4. Dedupe rule: same normalised address plus same email or phone within 90 days is one lead. Keep the earliest, attach the rest as `legacy_json`.
5. Write `d1_lead_id` back into each AC deal's custom field. This is the moment the two systems become joinable.
6. Sean reviews 30 random leads side by side. Any mismatch stops the import.
7. Repeat on production during a low-traffic window. Freeze the old worker for the duration.

### 5.2 Ongoing inbound (AC to D1)
Subscribed webhooks: `deal_add`, `deal_update`, `deal_stage_change`, `contact_update`, `note_add`.
Rules:
1. Look up lead by `d1_lead_id` custom field. If absent, treat as a manual AC lead: create in D1, write the ID back.
2. Apply only fields AC is allowed to own: deal stage, notes, contact phone and email corrections. Everything else is read and logged, not applied.
3. If D1 changed the same field within the last 10 minutes, record a `sync_conflict`, keep D1's value, surface it in the lead's activity feed.
4. Every event idempotent on `ac_event_id`.

### 5.3 Ongoing outbound (D1 to AC)
Handled entirely by dispatch steps. Nothing writes to AC outside the dispatcher. That means one retry model, one audit trail, one place to look when something is wrong.

### 5.4 Reconciliation
Nightly. Match on `d1_lead_id`. Report categories: D1 lead with no AC deal, AC deal with no D1 lead, stage mismatch, contact field mismatch, duplicate AC deals for one lead. Admin can resolve each item with one click (push D1 to AC, pull AC to D1, or mark reviewed).

### 5.5 Cutover
Router worker on the existing webhook route fans out to old worker (AC) and new worker (D1) for 48h shadow. Nightly diff. Flip to new-only when clean. Old worker idle for 7 days then removed. Rollback is a router flip, under 2 minutes.

---

## 6. Dispatch model

Sarah's Send is one job with ordered steps. Steps run in sequence unless flagged parallel.

| Seq | Step | Depends on |
|---|---|---|
| 1 | `vendor_email` | |
| 2 | `ac_contact_upsert` | |
| 3 | `ac_deal_create` (or update if exists) | 2 |
| 4 | `ac_deal_stage_update` | 3 |
| 5 | `ac_deal_note` (agent picks + reasons) | 3 |
| 6 | `agent_email` × N | parallel |
| 7 | `agent_sms` × N (consent-gated) | parallel |

Claim query (atomic, no row locks in SQLite):
```sql
UPDATE dispatch_jobs
SET status = 'locked', locked_by = ?, locked_at = CURRENT_TIMESTAMP,
    lease_expires_at = datetime(CURRENT_TIMESTAMP, '+2 minutes'),
    attempts = attempts + 1
WHERE id = (
  SELECT id FROM dispatch_jobs
  WHERE status IN ('pending', 'failed_retry')
    AND next_attempt_at <= CURRENT_TIMESTAMP
    AND (lease_expires_at IS NULL OR lease_expires_at < CURRENT_TIMESTAMP)
  ORDER BY created_at LIMIT 1
)
AND (status IN ('pending', 'failed_retry') OR lease_expires_at < CURRENT_TIMESTAMP)
RETURNING *;
```

Retries: 5 per step, backoff 30s, 2m, 10m, 1h, 6h with jitter. Any terminal step failure moves the job to `partial_send` for admin review. Stale rejection: each step carries `expected_lead_version`; mismatch means skipped, not sent.

Swap flow: untick agent, lead goes to `replacement_required`, pick replacement, new job contains only the delta (new agent email and SMS, AC note update, optional vendor update email).

---

## 7. Enrichment layer

### Adapter contract
```ts
interface PropertyAdapter {
  id: string;                      // 'cotality', 'manual', ...
  fields: FieldSpec[];             // which fields, TTL each, confidence
  lookup(address: NormalisedAddress): Promise<PropertyFacts | null>;
  comparables?(address, radiusM): Promise<Comparable[]>;
  rateLimit: { perMinute: number };
}
```

### Rules
1. Adapters run in priority order. First non-null value per field wins. Manual always wins.
2. Every value stored with `source`, `fetched_at`, `confidence`.
3. TTL per field: market values 7 days, static facts 90 days, comparables 30 days.
4. Enrichment is async. Portal never blocks. Lead workspace shows "enriching" per field and fills in as data arrives.
5. Adapter failure is logged and the field falls back to manual paste. Sarah is never stuck.
6. New adapters require a spike (§13 Phase 0 checklist) covering terms of use, rate limits, data quality on 10 real NZ addresses, and a decision from Sean. Scraping sites that prohibit it is out of scope.

### Comparison view (Phase 4 basic, Phase 8 full)
Basic: subject property CV vs median CV of comparables, last sale price vs CV ratio, count of sales in radius in last 12 months.
Full (Phase 8): price per sqm vs comps, days on market by agency, agency share of nearby sales, trend over 24 months. This is also the data that feeds the "why we recommend" note.

---

## 8. Agent layer

### Sources
1. `agents` table (MTA master). Imported from AC and the spreadsheet in Phase 2, deduped by phone then email then normalised name plus agency.
2. `agent_candidates` from comparables. Created automatically when a selling agent doesn't match with high confidence.
3. Optional public enrichment for candidates (agency website, REA licence lookup) only if the source's terms allow it and only for business contact details. Never personal social profiles.

### Matching
Normalise: lowercase, strip titles, expand nicknames (Mike to Michael), strip agency suffixes.
Confidence: `high` = phone match or email match; `medium` = normalised name + agency; `low` = name only.
`high` links automatically. `medium` and `low` sit in the shortlist as suggestions with a confirm / merge / dismiss control.

### Sign-up flow inside the portal
Sarah taps a candidate, sees phone and email, taps Call (tel: link on mobile, copy on desktop), logs outcome in `agent_contact_log`, and either promotes to `agents` with `membership_status = verbally_agreed` or dismisses. SMS consent is captured at promotion with method and timestamp. No consent, no SMS, no exceptions.

---

## 9. Lead state machine

```
received → enriching → ready_for_review → dispatching → sent | partial_send
                                                              │
                                              awaiting_agent_responses
                                                     ┌────────┴────────┐
                                           replacement_required     agent_appointed
                                                     │                    │
                                              (swap, back to        listed → sold → referral_invoiced → referral_paid
                                               ready_for_review)          │
                                                                        lost
```

Rules: only `consultant` and above can trigger Send. Only the dispatcher moves `dispatching` onward. Outcome states are set by Sarah in the portal or arrive from AC stage changes via sync-in. Every transition is audited. Lead is read-only in the UI while `dispatching`.

---

## 10. UI/UX specification

### Principles
1. One screen per job. Inbox to find, Workspace to decide, Send to act, Timeline to see what happened.
2. Nothing blank, nothing frozen. Every data region has loading, empty, error and stale states designed before the happy path.
3. Primary action always visible without scrolling, bottom-right on desktop, bottom bar on mobile.
4. Irreversible actions get a confirm with a plain-English summary of what will be sent to whom.
5. Optimistic UI only for local ticks and text. Never for sends or AC writes.
6. Same components on desktop and mobile. Layout changes, behaviour doesn't.
7. Keyboard-first on desktop from day one: Tab order, Enter to confirm, Esc to close. Shortcuts and ⌘K come in Phase 9.

### Screens (MVP)
| Screen | Desktop | Mobile |
|---|---|---|
| Inbox | Left rail list with state chips and filters, right pane preview | Full-width list, filter sheet, tap to open |
| Lead workspace | Three columns: property (left), agents (centre), vendor + send (right). Sticky Send bar. | Stacked sections with a sticky bottom bar: Property / Agents / Send tabs. Send button always in thumb reach. |
| Agent picker | Search, filter by status and distance, multi-select with reason field expanding inline | Bottom sheet, one agent per row, swipe right to pick, tap to expand reason |
| Candidate detail | Side panel with call, email, log outcome, promote | Full-screen sheet, Call is the primary button |
| Send confirm | Modal listing vendor email preview, each agent, channels, consent status | Full-screen confirm with the same list |
| Lead timeline | Right rail in workspace: every send, delivery, AC sync, conflict, outcome | Tab in the workspace |
| Admin dashboard | Jobs by status, delivery rates, reconciliation, sync conflicts, users | Read-only summary, replay actions desktop-only |
| Outcomes | Table with filters, inline edit, export | List with tap to edit |

### Design tokens
Brand colours from mytopagent.co.nz. One neutral scale, one accent, semantic colours for success, warning, danger, info. Type scale of 5 sizes. Spacing on 4px. Radius 8px. All defined once in `tokens.css` and consumed via Tailwind theme. No ad-hoc hex values in components (linted).

### Accessibility and performance
WCAG 2.1 AA contrast. Touch targets 44px minimum. Focus visible everywhere. Inbox to workspace open under 300ms on a warm cache. Largest Contentful Paint under 2s on 4G. Bundle budget checked in CI.

### Deferred to Phase 9
Framer Motion and Lenis, iOS-style sheet animations, pull-to-refresh, swipe actions beyond the agent picker, ⌘K palette, keyboard shortcuts, AI drafts, Slack.

---

## 11. Reliability rules (why it won't break tomorrow)

1. **Pinned dependencies.** Lockfile committed. Renovate opens PRs, nothing auto-merges. Major bumps get a staging soak.
2. **CI on every PR.** Lint, typecheck, unit tests, integration tests against recorded fixtures for AC, Postmark, TransmitSMS and Cotality. Red CI cannot merge.
3. **Contract tests.** Each external provider has a fixture set and a schema check. When a provider changes its response shape, the test fails before production does.
4. **Staging gate.** `main` deploys to staging. Prod deploys only from a tagged release after the phase test gate passes on staging.
5. **Feature flags.** Every adapter, every sync direction, every notification channel behind a flag stored in D1. Anything misbehaving is switched off in seconds without a deploy.
6. **Migrations forward-only.** Every migration ships with a tested rollback script and runs on staging first.
7. **Daily canary.** Cron creates a synthetic lead on staging, runs enrichment, sends to allowlisted addresses, syncs to a staging AC account, checks every step succeeded. Failure emails Sean and Imran before Sarah notices anything.
8. **Health endpoint.** `/api/health` checks D1, Postmark, AC, TransmitSMS auth and last cron tick. Uptime monitor pings it every 5 minutes.
9. **Structured logs with correlation IDs.** Every request, job and step logs `correlation_id`, `lead_id`, `user_id`, `action`, `duration_ms`, `result`.
10. **Alerts.** More than 5 terminal job failures in 24h, reconciliation drift above 2 percent, 10+ auth failures per hour on any provider, canary failure, cron silent for 10 minutes.
11. **Runbook.** Written in Phase 7 and kept in the repo: AC down, Postmark down, SMS down, Cotality down, job stuck, sync conflict backlog, restore from Time Travel.
12. **Change log.** Every prod release lists what changed and how to roll back. Sean gets it by email.

---

## 12. Authorization, roles, privacy

### Roles
| Role | Can | Cannot |
|---|---|---|
| `consultant` | View and edit leads, agents, candidates. Send. Record outcomes. | Change roles, hard delete, replay jobs, resolve sync conflicts, export |
| `admin` | Everything, including admin dashboard, replay, reconciliation, users, exports | |
| `readonly` | View only | Any write |

Server actions check role on every call. Google `email_verified` required. Email must be in `users` with `active = true`.

### NZ Privacy Act 2020
Handled by the system: data minimisation, role access, audit of PII edits and exports, staging allowlists, encryption at rest and in transit, no vendor PII sent to Anthropic or to any enrichment adapter (address only).

Needs Sean to confirm with a privacy adviser, not hardcoded: retention periods (defaults: leads 12 months after last outcome, delivery logs 6 months, audit 24 months), landing page consent wording covering that vendor details go to shortlisted agents, breach response ownership, process for access and deletion requests. Public agent data: collect business contact details only, from sources whose terms permit it, and give agents a way to opt out.

---

## 13. Phased build plan

Every phase ends with a manual test gate on staging plus a 48h soak before the next phase starts.

### Phase 0, Discovery and spikes (3 days)
Build: AC full export to R2 and a field inventory. Field mapping doc. Cotality validation spike with real credentials on 5 addresses (property lookup and radius search, confirm whether agent phone and email come back). Terms-of-use review for any other property source Sean wants. Design tokens and the four core screens as static mockups for Sean and Sarah to react to.
Gate: Sean signs the field mapping. Cotality spike result recorded in `docs/spikes/`. Mockups approved.
Blockers: AC API key, Cotality credentials, brand assets.

### Phase 1, Foundation (2 to 3 days)
Build: Repo, CI, three environments, D1 schema and migrations, auth and roles, agent CRUD, audit log, health endpoint, feature flag table, staging allowlists, deploy to staging.
Gate: Non-allowlisted login rejected. Role enforcement verified. Two-tab edit returns 409. Staging refuses non-allowlisted sends. CI blocks a deliberately broken PR.

### Phase 2, AC import and two-way sync (3 to 4 days)
Build: Import script and report. Dedupe. Write-back of `d1_lead_id`. Webhook receiver and `sync_events` applier. Conflict detection. Reconciler. Agent import from AC and spreadsheet.
Gate: Staging import matches Sean's 30-lead spot check. Change a stage in staging AC, see it in the portal under 5 minutes. Change the same field both sides, D1 wins, conflict logged. Reconciler reports zero drift after a clean import, then correctly flags a deliberately deleted AC deal.

### Phase 3, Lead ingestion and inbox (2 days)
Build: New webhook, router worker, shadow mode, inbox UI with polling, state chips and filters, mobile list.
Gate: Form submission visible in inbox under 90s. Duplicate submission deduped. 48h shadow diff clean. Rollback via router under 2 minutes.

### Phase 4, Lead workspace and enrichment (3 to 4 days)
Build: Workspace layout desktop and mobile. Manual property form. Cotality adapter behind a flag (if spike passed). Comparables fetch and basic comparison view. Per-field provenance and TTL. Autosave with per-entity versioning.
Gate: Open lead, enrichment fills within 30s or falls back to manual cleanly with Cotality flag off. Manual edit survives a refresh. Two tabs editing different fields both save.

### Phase 5, Agent shortlist and candidates (3 days)
Build: Name normalisation and matching. Shortlist populated from comparables. Candidate panel with call, log, promote, dismiss. SMS consent capture. Reason notes and pick ordering. Mobile agent picker sheet.
Gate: 5 real addresses produce shortlists Sarah agrees with. Ambiguous name shows as medium, not auto-linked. Promote a candidate, it appears in agents with consent recorded.

### Phase 6, Dispatch (3 days)
Build: Templates and versioning. Postmark, TransmitSMS, AC outbound steps. Dispatcher and claim logic. Send confirm screen. Partial-send handling. Swap flow. Timeline view.
Gate: Full end-to-end under 90s to allowlisted recipients. Force AC contact step to fail, deal step does not run, lead in partial_send. Double-click Send yields one of everything. Swap sends only to the new agent. Delay a step, edit the lead, step is skipped as stale.

### Phase 7, Reliability and admin (3 days)
Build: Admin dashboard, replay, reconciliation UI, sync conflict resolution, user management, alerts, canary, runbook, Logpush, outcome recording screen and `ac_outcome_update` step.
Gate: 20 leads in an hour handled. 5 forced AC failures produce a terminal job and an alert. Replay completes it. Kill a worker mid-lease, next tick recovers. Canary runs green three nights in a row.

### MVP live
Sean signs off. Production import, cutover, 7 day soak with daily check-ins. No new features during the soak.

### Phase 8, Analytics and comparison (3 to 4 days)
Build: Full comparison view. Outcomes dashboard: leads by month, time to send, agent acceptance rate, appointed to listed to sold to paid funnel, referral revenue by agent and agency, drift between CV and sale price by suburb. Export to CSV.
Gate: Numbers reconcile to a manual count of one month of AC data.

### Phase 9, Polish (ship each independently)
9a AI drafts for "why we recommend" using property and comparable context only. 9b keyboard shortcuts and ⌘K. 9c animations. 9d mobile gestures and sheets. 9e Slack alerts. 9f additional property adapters if Phase 0 review approved any.

---

## 14. Progress tracker

- [ ] Phase 0 Discovery and spikes
- [ ] Phase 1 Foundation
- [ ] Phase 2 AC import and sync
- [ ] Phase 3 Ingestion and inbox
- [ ] Phase 4 Workspace and enrichment
- [ ] Phase 5 Agent shortlist and candidates
- [ ] Phase 6 Dispatch
- [ ] Phase 7 Reliability and admin
- [ ] MVP live and 7 day soak
- [ ] Phase 8 Analytics
- [ ] Phase 9a to 9f

Context compression checkpoints: after Phase 2, Phase 4, Phase 7, Phase 8, and each Phase 9 slice. Clear the conversation and reload this file.

---

## 15. Dependency checklist

| Phase | Needed before starting |
|---|---|
| 0 | AC API key and URL, Cotality credentials and endpoint list, brand assets, list of any other property sites Sean wants considered |
| 1 | Cloudflare token (Workers, D1, DNS, R2), Google OAuth client, allowlist emails and roles, GitHub repo |
| 2 | Signed field mapping, AC pipeline and stage IDs, custom field ID for `d1_lead_id`, staging AC account or sandbox pipeline, agent spreadsheet |
| 3 | Existing worker source, HMAC secret, DNS access |
| 4 | Phase 0 Cotality spike result |
| 5 | Nothing new |
| 6 | Postmark account with verified domain (SPF, DKIM, DMARC), TransmitSMS key and approved NZ sender ID (allow 1 to 3 business days), Sean's approval on vendor and agent templates |
| 7 | Nothing new |
| 8 | One month of confirmed outcome data |
| 9 | Anthropic key (9a), Slack webhook (9e) |

---

## 16. Environment and secrets

One set per environment: `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `WEBHOOK_HMAC_SECRET`, `AC_API_URL`, `AC_API_KEY`, `AC_WEBHOOK_SECRET`, `POSTMARK_SERVER_TOKEN`, `POSTMARK_MESSAGE_STREAM`, `POSTMARK_STAGING_ALLOWLIST`, `TRANSMITSMS_API_KEY`, `TRANSMITSMS_API_SECRET`, `TRANSMITSMS_STAGING_ALLOWLIST`, `COTALITY_API_KEY`, `ANTHROPIC_API_KEY` (9a), `SLACK_WEBHOOK_URL` (9e), `R2_BUCKET`.

---

## 17. Non-negotiables

1. D1 is master. AC is a synced peer. D1 wins conflicts, and every conflict is logged and visible.
2. Nothing writes to AC outside the dispatcher.
3. Every external write carries an idempotency key. Every step carries an expected lead version.
4. Every phase passes its test gate on staging and soaks 48h before the next starts.
5. Every adapter, sync direction and channel sits behind a feature flag.
6. Manual data entry always works, even if every external source is down.
7. SMS only with recorded consent.
8. Confirm before any send. Optimistic UI only for local state.
9. Staging never contacts a real vendor or agent.
10. Loading, empty, error and stale states designed for every data region before the happy path is built.
11. Daily canary must be green before any prod deploy.
12. No hex colours, spacing or type sizes outside `tokens.css`.

---

## 18. What changed from v3 and why

| v3 | v4 | Why |
|---|---|---|
| AC is a downstream mirror, portal never reads from it | AC is a historical system to import and a synced peer with inbound webhooks | AC already holds all past leads and the team keeps working in it. One-way push would have left two disconnected databases. |
| No import step | Phase 2 import, dedupe, `d1_lead_id` write-back, 30-lead spot check | The join key has to exist before anything else can reconcile. |
| Reconciliation by count | Reconciliation by `d1_lead_id` with per-category drift and one-click resolution | Counts hide swaps and duplicates. |
| Cotality as a hard-coded integration in Phase 7 | Adapter layer with provenance and TTL, Cotality first, others gated by legal and technical spike | Sean wants multiple sources. Adapters keep each one isolated and switchable. |
| Agents only from MTA DB or Cotality radius | `agent_candidates` with confidence, call log, promote flow, consent capture | The real bottleneck is signing new agents, and that had no home in v3. |
| No outcome tracking | `lead_outcomes` through to referral paid, synced with AC stages | Sean's business metric is referral revenue, not messages sent. |
| Mobile deferred to Phase 9 | Responsive from Phase 4, sticky action bar, sheets for pickers | Sarah works from her phone between calls. |
| Reliability as Phase 6 | Reliability rules apply from Phase 1: CI, flags, canary, contract tests, staging gate | The stated problem is "works today, broken tomorrow". That is a process problem, not a feature. |
| 14 to 18 days MVP | 25 to 32 days MVP | v3 was under-scoped for the sync and enrichment work now in scope. Honest estimate beats a missed one. |

*End of plan v4. Reload this file whenever context is compressed.*
