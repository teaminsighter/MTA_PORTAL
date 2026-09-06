export const dynamic = "force-dynamic";

import {
  Activity,
  AlertOctagon,
  CheckCircle,
  Clock3,
  DollarSign,
  Inbox,
  RefreshCcw,
  Users,
} from "lucide-react";
import { KpiTile } from "@/components/admin/KpiTile";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { StateChip } from "@/components/lead/StateChip";
import { computeKpis } from "@/lib/repo/kpis";
import { listRecentLeads } from "@/lib/repo/leads";
import { listRecentOutcomes } from "@/lib/repo/outcomes";
import { countSignedAgents } from "@/lib/repo/agents";
import { formatDateNZ, formatMoneyNZ, formatRelative } from "@/lib/utils";

interface OutcomeRow {
  id: string;
  lead_id: string;
  outcome: string;
  winning_agent: string | null;
  sale_price: number | null;
  referral_amount: number | null;
  recorded_at: string;
}

interface SyncConflictRow {
  id: string;
  lead_id: string;
  field: string;
  d1_value: string;
  ac_value: string;
  detected_at: string;
}

interface DispatchJobRow {
  id: string;
  lead_id: string;
  status: string;
  attempts: number;
  next_attempt_at: string;
}

const syncConflictRows: SyncConflictRow[] = [
  {
    id: "SC-1",
    lead_id: "MTA-2026-00414",
    field: "vendor.phone",
    d1_value: "+64 21 909 5511",
    ac_value: "+64 21 909 5510",
    detected_at: "2026-09-05T01:12:00Z",
  },
  {
    id: "SC-2",
    lead_id: "MTA-2026-00413",
    field: "deal.stage",
    d1_value: "awaiting_agent_responses",
    ac_value: "Contacted",
    detected_at: "2026-09-04T22:44:00Z",
  },
];

// Synthetic display data for Phase 1. Will be replaced by
// listDispatchJobs() from a dispatch repo when Phase 6 lands.
const dispatchJobRows: DispatchJobRow[] = [
  {
    id: "DJ-1200",
    lead_id: "MTA-2026-00419",
    status: "locked",
    attempts: 1,
    next_attempt_at: "2026-09-05T02:30:00Z",
  },
  {
    id: "DJ-1201",
    lead_id: "MTA-2026-00415",
    status: "failed_retry",
    attempts: 3,
    next_attempt_at: "2026-09-05T03:00:00Z",
  },
  {
    id: "DJ-1202",
    lead_id: "MTA-2026-00413",
    status: "sent",
    attempts: 1,
    next_attempt_at: "2026-09-05T02:30:00Z",
  },
];

const outcomeColumns: Column<OutcomeRow>[] = [
  { key: "lead_id", header: "Lead", render: (r) => r.lead_id },
  {
    key: "outcome",
    header: "Outcome",
    render: (r) => <span className="chip chip-neutral">{r.outcome}</span>,
  },
  {
    key: "winning_agent",
    header: "Winning agent",
    render: (r) => r.winning_agent ?? "—",
  },
  {
    key: "sale_price",
    header: "Sale price",
    align: "right",
    numeric: true,
    render: (r) => formatMoneyNZ(r.sale_price),
  },
  {
    key: "referral_amount",
    header: "Referral",
    align: "right",
    numeric: true,
    render: (r) => formatMoneyNZ(r.referral_amount),
  },
  {
    key: "recorded_at",
    header: "When",
    align: "right",
    numeric: true,
    render: (r) => formatDateNZ(r.recorded_at),
  },
];

const syncConflictColumns: Column<SyncConflictRow>[] = [
  { key: "lead_id", header: "Lead", render: (r) => r.lead_id },
  { key: "field", header: "Field", render: (r) => r.field },
  {
    key: "d1_value",
    header: "D1 value",
    render: (r) => <span className="tabular">{r.d1_value}</span>,
  },
  {
    key: "ac_value",
    header: "AC value",
    render: (r) => <span className="tabular">{r.ac_value}</span>,
  },
  {
    key: "detected_at",
    header: "Detected",
    align: "right",
    numeric: true,
    render: (r) => formatRelative(r.detected_at),
  },
];

const dispatchJobColumns: Column<DispatchJobRow>[] = [
  { key: "id", header: "Job", render: (r) => r.id },
  { key: "lead_id", header: "Lead", render: (r) => r.lead_id },
  {
    key: "status",
    header: "Status",
    render: (r) => {
      const chip =
        r.status === "failed_retry"
          ? "chip-danger"
          : r.status === "locked"
          ? "chip-warning"
          : "chip-success";
      return <span className={`chip ${chip}`}>{r.status}</span>;
    },
  },
  {
    key: "attempts",
    header: "Attempts",
    align: "right",
    numeric: true,
    render: (r) => r.attempts,
  },
  {
    key: "next_attempt_at",
    header: "Next attempt",
    align: "right",
    numeric: true,
    render: (r) => formatRelative(r.next_attempt_at),
  },
];

export default async function AdminPage() {
  const [kpis, recentLeads, outcomes, signedAgents] = await Promise.all([
    computeKpis(),
    listRecentLeads(6),
    listRecentOutcomes(12),
    countSignedAgents(),
  ]);

  const outcomeRows: OutcomeRow[] = outcomes.map((o, i) => ({
    id: `${o.lead_id}-${i}`,
    ...o,
  }));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <h1 className="t-display">Admin</h1>
        <span className="t-caption text-text-muted">
          Canary{" "}
          <span
            className={`chip chip-${
              kpis.canary_status === "green" ? "success" : "danger"
            }`}
          >
            {kpis.canary_status}
          </span>
        </span>
      </header>

      {/* KPI tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          label="Leads this month"
          value={kpis.leads_this_month.toLocaleString("en-NZ")}
          delta="vs last month"
          tone="success"
          icon={<Inbox size={14} />}
        />
        <KpiTile
          label="Avg. time to send"
          value={
            kpis.avg_time_to_send_min > 0
              ? `${kpis.avg_time_to_send_min} min`
              : "—"
          }
          delta="target 5–6 min"
          tone="warning"
          icon={<Clock3 size={14} />}
        />
        <KpiTile
          label="Agent acceptance"
          value={
            kpis.agent_acceptance_pct > 0 ? `${kpis.agent_acceptance_pct}%` : "—"
          }
          tone="success"
          icon={<CheckCircle size={14} />}
        />
        <KpiTile
          label="Referral revenue MTD"
          value={formatMoneyNZ(kpis.referral_revenue_mtd)}
          tone="success"
          icon={<DollarSign size={14} />}
        />
        <KpiTile
          label="Pending partial sends"
          value={kpis.pending_partial_sends.toString()}
          tone={kpis.pending_partial_sends > 0 ? "danger" : "neutral"}
          icon={<AlertOctagon size={14} />}
        />
        <KpiTile
          label="Sync conflicts"
          value={kpis.sync_conflicts.toString()}
          tone={kpis.sync_conflicts > 0 ? "warning" : "neutral"}
          icon={<RefreshCcw size={14} />}
        />
        <KpiTile
          label="Signed agents"
          value={signedAgents.toString()}
          tone="neutral"
          icon={<Users size={14} />}
        />
        <KpiTile
          label="Active dispatch jobs"
          value={dispatchJobRows.length.toString()}
          tone="neutral"
          icon={<Activity size={14} />}
        />
      </div>

      <DataTable
        title="Recent outcomes"
        columns={outcomeColumns}
        rows={outcomeRows}
        primaryAction={{ label: (r) => `View ${r.lead_id}` }}
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <DataTable
          title="Sync conflicts"
          columns={syncConflictColumns}
          rows={syncConflictRows}
          emptyMessage="No sync conflicts. Nice."
          primaryAction={{ label: () => "Resolve conflict" }}
        />
        <DataTable
          title="Dispatch jobs"
          columns={dispatchJobColumns}
          rows={dispatchJobRows}
          emptyMessage="No active jobs."
          primaryAction={{
            label: (r) => (r.status === "failed_retry" ? "Retry job" : "Inspect job"),
          }}
        />
      </div>

      {/* Mobile-friendly recent leads glance */}
      <section className="flex flex-col gap-2">
        <h3 className="t-body font-semibold">Recent leads</h3>
        <ul className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {recentLeads.map((l) => (
            <li
              key={l.id}
              className="neu-raised-sm p-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="t-body font-medium truncate">{l.address}</div>
                <div className="t-caption text-text-muted truncate">
                  {l.id} · {formatRelative(l.created_at)}
                </div>
              </div>
              <StateChip state={l.state} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
