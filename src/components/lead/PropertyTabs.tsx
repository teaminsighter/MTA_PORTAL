"use client";

import { useState } from "react";
import type {
  ActivityEvent,
  Comparable,
  Lead,
  PropertyFacts,
} from "@/lib/mock";
import { cn } from "@/lib/utils";
import {
  formatDateNZ,
  formatMoneyNZ,
  formatRelative,
} from "@/lib/utils";
import { DataSourcesCard } from "@/components/lead/DataSourcesCard";
import { PropertyReport } from "@/components/lead/PropertyReport";

interface PropertyTabsProps {
  lead: Lead;
  property: PropertyFacts;
  comps: Comparable[];
  history: ActivityEvent[];
}

type Tab = "snapshot" | "report" | "analysis" | "nearby" | "history";

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "snapshot", label: "Snapshot" },
  { key: "report", label: "Report" },
  { key: "analysis", label: "Analysis" },
  { key: "nearby", label: "Nearby sales" },
  { key: "history", label: "History" },
];

export function PropertyTabs({
  lead,
  property,
  comps,
  history,
}: PropertyTabsProps) {
  const [tab, setTab] = useState<Tab>("snapshot");

  return (
    <div className="flex flex-col gap-3">
      {/* Tab bar (neumorphic inset track, active tab is raised).
          Horizontally scrollable when the left column is too narrow
          to fit all five labels — hides the scrollbar on macOS/iOS
          so it reads as a normal pill row until you swipe. */}
      <div className="neu-inset-sm p-1 flex self-start max-w-full overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 t-body rounded-neu-sm transition-colors whitespace-nowrap shrink-0",
              tab === t.key
                ? "neu-raised-sm text-text font-semibold"
                : "text-text-muted"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "snapshot" ? <Snapshot comps={comps} /> : null}
      {tab === "report" ? (
        <PropertyReport lead={lead} property={property} />
      ) : null}
      {tab === "analysis" ? <Analysis property={property} /> : null}
      {tab === "nearby" ? <NearbyTable comps={comps} /> : null}
      {tab === "history" ? <History events={history} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Analysis: cross-source data quality + valuation triangulation      */
/* ------------------------------------------------------------------ */
function Analysis({ property }: { property: PropertyFacts }) {
  const hasAny =
    property.cv ||
    property.estimate ||
    property.land_value ||
    property.improvements ||
    property.land_area ||
    property.floor_area ||
    property.bedrooms ||
    property.year_built ||
    property.last_sold_date ||
    property.last_sold_price;

  if (!hasAny) {
    return (
      <div className="surface-flat p-6 text-center text-text-muted t-body">
        Nothing to analyse yet — enrichment is still in progress.
      </div>
    );
  }

  return <DataSourcesCard property={property} />;
}

/* ------------------------------------------------------------------ */
/* Snapshot: three headline numbers extracted from the comparable set */
/* ------------------------------------------------------------------ */
function Snapshot({ comps }: { comps: Comparable[] }) {
  if (comps.length === 0) {
    return (
      <div className="surface-flat p-6 text-center text-text-muted t-body">
        No comparables yet.
      </div>
    );
  }

  const prices = comps.map((c) => c.sale_price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  const min = prices[0];
  const max = prices[prices.length - 1];
  const cvs = comps.map((c) => c.cv_at_sale);
  const avgCv =
    cvs.reduce((sum, v) => sum + v, 0) / (cvs.length || 1);
  const deltaVsCvPct = Math.round(((median - avgCv) / avgCv) * 100);

  const cells = [
    {
      label: "Nearby sales",
      value: `${comps.length}`,
      caption: "last 6 months",
    },
    {
      label: "Median sale",
      value: formatMoneyNZ(median),
      caption: `range ${formatMoneyNZ(min)}–${formatMoneyNZ(max)}`,
    },
    {
      label: "Median vs CV",
      value: `${deltaVsCvPct > 0 ? "+" : ""}${deltaVsCvPct}%`,
      caption: "at time of sale",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cells.map((c) => (
        <div key={c.label} className="neu-raised-sm p-4 flex flex-col gap-1">
          <span className="t-caption text-text-subtle uppercase tracking-wide">
            {c.label}
          </span>
          <span className="t-section tabular">{c.value}</span>
          <span className="t-caption text-text-muted">{c.caption}</span>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nearby table: full-width, one-line addresses, right-aligned money  */
/* ------------------------------------------------------------------ */
function NearbyTable({ comps }: { comps: Comparable[] }) {
  if (comps.length === 0) {
    return (
      <div className="surface-flat p-6 text-center text-text-muted t-body">
        No comparables yet.
      </div>
    );
  }
  return (
    <div className="surface-flat overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full t-body">
          <thead className="bg-surface-elevated text-text-muted">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Address</th>
              <th className="text-right px-4 py-2 font-medium">Sale</th>
              <th className="text-right px-4 py-2 font-medium">vs CV</th>
              <th className="text-right px-4 py-2 font-medium">Distance</th>
              <th className="text-right px-4 py-2 font-medium">Sold</th>
              <th className="text-left px-4 py-2 font-medium">Agent</th>
            </tr>
          </thead>
          <tbody>
            {comps.map((c, i) => {
              const delta = Math.round(
                ((c.sale_price - c.cv_at_sale) / c.cv_at_sale) * 100
              );
              const tone =
                delta > 3
                  ? "chip-success"
                  : delta < -3
                  ? "chip-danger"
                  : "chip-neutral";
              return (
                <tr
                  key={c.address}
                  className={i % 2 === 1 ? "bg-surface-elevated" : ""}
                >
                  <td className="px-4 py-2 whitespace-nowrap">{c.address}</td>
                  <td className="px-4 py-2 text-right tabular">
                    {formatMoneyNZ(c.sale_price)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <span className={cn("chip", tone, "tabular")}>
                      {delta > 0 ? "+" : ""}
                      {delta}%
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular">
                    {c.distance_m} m
                  </td>
                  <td className="px-4 py-2 text-right tabular">
                    {formatDateNZ(c.sale_date)}
                  </td>
                  <td className="px-4 py-2 text-text-muted whitespace-nowrap">
                    {c.agent_name}
                    <span className="text-text-subtle"> · {c.agency}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* History: compact vertical trail of activity events                 */
/* ------------------------------------------------------------------ */
function History({ events }: { events: ActivityEvent[] }) {
  if (events.length === 0) {
    return (
      <div className="surface-flat p-6 text-center text-text-muted t-body">
        No history yet.
      </div>
    );
  }
  return (
    <ol className="surface-flat divide-y">
      {events.map((e, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-3">
          <span
            aria-hidden
            className="mt-2 h-2 w-2 rounded-neu-pill shrink-0"
            style={{ background: "var(--accent-gradient)" }}
          />
          <div className="min-w-0 flex-1">
            <div className="t-body">{e.detail}</div>
            <div className="t-caption text-text-subtle tabular">
              {formatRelative(e.at)}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
