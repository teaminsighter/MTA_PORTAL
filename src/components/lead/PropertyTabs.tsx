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
  formatMoneyNZCompact,
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

      {tab === "snapshot" ? (
        <Snapshot property={property} comps={comps} />
      ) : null}
      {tab === "report" ? (
        <PropertyReport lead={lead} property={property} />
      ) : null}
      {tab === "analysis" ? (
        <Analysis property={property} comps={comps} />
      ) : null}
      {tab === "nearby" ? <NearbyTable comps={comps} /> : null}
      {tab === "history" ? <History events={history} /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Snapshot: property-first grid of the numbers Sarah scans in a beat */
/* ------------------------------------------------------------------ */
function Snapshot({
  property,
  comps,
}: {
  property: PropertyFacts;
  comps: Comparable[];
}) {
  const cv = property.cv?.value;
  const est = property.estimate?.value;
  const delta = cv && est ? Math.round(((est - cv) / cv) * 100) : null;
  const pricePerSqm =
    est && property.floor_area?.value
      ? Math.round(est / property.floor_area.value)
      : null;

  const cards: Array<{
    label: string;
    value: string;
    caption?: string;
    tone?: string;
  } | null> = [
    cv
      ? {
          label: "Capital value",
          value: formatMoneyNZCompact(cv),
          caption: property.cv?.source
            ? `from ${property.cv.source}`
            : undefined,
        }
      : null,
    est
      ? {
          label: "Estimate",
          value: formatMoneyNZCompact(est),
          caption: property.estimate?.source
            ? `from ${property.estimate.source}`
            : undefined,
        }
      : null,
    delta != null
      ? {
          label: "Δ vs CV",
          value: `${delta > 0 ? "+" : ""}${delta}%`,
          caption:
            delta >= 8
              ? "well above CV"
              : delta >= 3
                ? "above CV"
                : delta >= -3
                  ? "in line with CV"
                  : delta >= -8
                    ? "below CV"
                    : "well below CV",
          tone:
            delta >= 8
              ? "text-success"
              : delta <= -8
                ? "text-danger"
                : undefined,
        }
      : null,
    property.land_area?.value
      ? {
          label: "Land area",
          value: `${property.land_area.value.toLocaleString("en-NZ")} m²`,
          caption:
            property.land_area.source === "linz" ? "LINZ cadastre" : undefined,
        }
      : null,
    property.floor_area?.value
      ? {
          label: "Floor area",
          value: `${property.floor_area.value.toLocaleString("en-NZ")} m²`,
          caption: property.floor_area.source
            ? `from ${property.floor_area.source}`
            : undefined,
        }
      : null,
    property.bedrooms?.value
      ? {
          label: "Bedrooms",
          value: String(property.bedrooms.value),
        }
      : null,
    property.year_built?.value
      ? {
          label: "Year built",
          value: String(property.year_built.value),
          caption: `${Math.max(0, new Date().getFullYear() - property.year_built.value)} yrs old`,
        }
      : null,
    property.last_sold_price?.value
      ? {
          label: "Last sold",
          value: formatMoneyNZCompact(property.last_sold_price.value),
          caption: property.last_sold_date?.value
            ? formatDateNZ(property.last_sold_date.value)
            : undefined,
        }
      : null,
    pricePerSqm
      ? {
          label: "Est. $/m²",
          value: formatMoneyNZ(pricePerSqm),
          caption: "estimate ÷ floor area",
        }
      : null,
  ];
  const present = cards.filter(
    (c): c is { label: string; value: string; caption?: string; tone?: string } =>
      !!c
  );

  if (present.length === 0) {
    return (
      <div className="surface-flat p-6 text-center text-text-muted t-body">
        No property data yet — will populate as enrichment lands.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {present.map((c) => (
          <div
            key={c.label}
            className="neu-raised-sm p-4 flex flex-col gap-1"
          >
            <span className="t-caption text-text-subtle uppercase tracking-wide">
              {c.label}
            </span>
            <span className={cn("t-section tabular", c.tone)}>{c.value}</span>
            {c.caption ? (
              <span className="t-caption text-text-muted">{c.caption}</span>
            ) : null}
          </div>
        ))}
      </div>
      {comps.length > 0 ? <NearbyMarketStrip comps={comps} /> : null}
    </div>
  );
}

function NearbyMarketStrip({ comps }: { comps: Comparable[] }) {
  const prices = comps.map((c) => c.sale_price).sort((a, b) => a - b);
  const median = prices[Math.floor(prices.length / 2)];
  const min = prices[0];
  const max = prices[prices.length - 1];
  const cvs = comps.map((c) => c.cv_at_sale);
  const avgCv = cvs.reduce((s, v) => s + v, 0) / (cvs.length || 1);
  const dvsCv = Math.round(((median - avgCv) / avgCv) * 100);

  return (
    <div className="surface-flat p-4 rounded-neu grid grid-cols-1 sm:grid-cols-3 gap-3">
      <StripStat
        label="Nearby sales"
        value={String(comps.length)}
        caption="last 6 months"
      />
      <StripStat
        label="Median sale"
        value={formatMoneyNZCompact(median)}
        caption={`range ${formatMoneyNZCompact(min)}–${formatMoneyNZCompact(max)}`}
      />
      <StripStat
        label="Median vs CV"
        value={`${dvsCv > 0 ? "+" : ""}${dvsCv}%`}
        caption="at time of sale"
      />
    </div>
  );
}

function StripStat({
  label,
  value,
  caption,
}: {
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="t-caption text-text-subtle uppercase tracking-wide">
        {label}
      </span>
      <span className="t-body font-semibold tabular">{value}</span>
      <span className="t-caption text-text-muted">{caption}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Analysis: valuation triangulation + trajectory + comp spread       */
/* ------------------------------------------------------------------ */
function Analysis({
  property,
  comps,
}: {
  property: PropertyFacts;
  comps: Comparable[];
}) {
  const cv = property.cv?.value;
  const est = property.estimate?.value;
  const soldPrice = property.last_sold_price?.value;
  const soldDate = property.last_sold_date?.value;

  const compPrices = comps.map((c) => c.sale_price).sort((a, b) => a - b);
  const compMedian =
    compPrices.length > 0
      ? compPrices[Math.floor(compPrices.length / 2)]
      : null;
  const compMin = compPrices.length > 0 ? compPrices[0] : null;
  const compMax =
    compPrices.length > 0 ? compPrices[compPrices.length - 1] : null;

  const hasAny =
    cv || est || soldPrice || compMedian || property.land_area || property.floor_area;

  if (!hasAny) {
    return (
      <div className="surface-flat p-6 text-center text-text-muted t-body">
        Nothing to analyse yet — enrichment is still in progress.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {(cv || est || compMedian) ? (
        <AnalysisBlock title="Valuation triangulation">
          <TriangulationBars cv={cv} est={est} compMedian={compMedian} />
          <p className="t-caption text-text-muted mt-2">
            Compares the council capital value against the current market
            estimate and the median of nearby sales.
          </p>
        </AnalysisBlock>
      ) : null}

      {soldPrice && (cv || est) ? (
        <AnalysisBlock title="Price trajectory">
          <Trajectory
            soldPrice={soldPrice}
            soldDate={soldDate}
            cv={cv}
            est={est}
          />
        </AnalysisBlock>
      ) : null}

      {compMedian && compMin && compMax ? (
        <AnalysisBlock title="Comparable spread">
          <ComparableSpread
            min={compMin}
            max={compMax}
            median={compMedian}
            subject={est ?? cv ?? null}
          />
        </AnalysisBlock>
      ) : null}

      <AnalysisBlock title="Data quality">
        <DataSourcesCard property={property} />
      </AnalysisBlock>
    </div>
  );
}

function AnalysisBlock({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="t-caption text-text-subtle uppercase tracking-wide">
        {title}
      </div>
      {children}
    </section>
  );
}

function TriangulationBars({
  cv,
  est,
  compMedian,
}: {
  cv: number | undefined;
  est: number | undefined;
  compMedian: number | null;
}) {
  const rows = [
    cv ? { label: "Capital value", value: cv, hue: "#FF7A00" } : null,
    est ? { label: "Estimate", value: est, hue: "#FF3D71" } : null,
    compMedian
      ? { label: "Comparable median", value: compMedian, hue: "#3366FF" }
      : null,
  ].filter((r): r is { label: string; value: number; hue: string } => !!r);
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="surface-flat p-4 rounded-neu flex flex-col gap-3">
      {rows.map((r) => {
        const pct = Math.round((r.value / max) * 100);
        return (
          <div key={r.label} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between t-caption">
              <span className="text-text-muted">{r.label}</span>
              <span className="tabular font-semibold text-text">
                {formatMoneyNZCompact(r.value)}
              </span>
            </div>
            <div
              className="h-2 w-full rounded-neu-pill overflow-hidden neu-inset-sm"
              aria-hidden
            >
              <div
                className="h-full rounded-neu-pill transition-[width] duration-500"
                style={{ width: `${pct}%`, background: r.hue }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Trajectory({
  soldPrice,
  soldDate,
  cv,
  est,
}: {
  soldPrice: number;
  soldDate: string | undefined;
  cv: number | undefined;
  est: number | undefined;
}) {
  const nowYear = new Date().getFullYear();
  const soldYear = soldDate ? new Date(soldDate).getFullYear() : nowYear;
  const years = Math.max(1, nowYear - soldYear);
  const to = est ?? cv ?? soldPrice;
  const total = Math.round(((to - soldPrice) / soldPrice) * 100);
  const annualised = Math.round((Math.pow(to / soldPrice, 1 / years) - 1) * 100);

  const points: Array<{
    label: string;
    value: number;
    caption: string;
  }> = [
    {
      label: `Sold ${soldDate ? formatDateNZ(soldDate) : ""}`,
      value: soldPrice,
      caption: formatMoneyNZ(soldPrice),
    },
  ];
  if (cv) {
    points.push({
      label: "Current CV",
      value: cv,
      caption: formatMoneyNZ(cv),
    });
  }
  if (est) {
    points.push({
      label: "Market estimate",
      value: est,
      caption: formatMoneyNZ(est),
    });
  }

  const max = Math.max(...points.map((p) => p.value));
  const min = Math.min(...points.map((p) => p.value));
  const range = Math.max(1, max - min);

  return (
    <div className="surface-flat p-4 rounded-neu flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 items-end min-h-[6rem]">
        {points.map((p) => {
          const heightPct = 30 + Math.round(((p.value - min) / range) * 60);
          return (
            <div
              key={p.label}
              className="flex flex-col items-center gap-1 justify-end h-full"
            >
              <div
                className="w-8 rounded-t-neu-sm"
                style={{
                  height: `${heightPct}%`,
                  background: "var(--accent-gradient)",
                  minHeight: 8,
                }}
                aria-hidden
              />
              <span className="t-caption text-text-muted text-center leading-tight">
                {p.label}
              </span>
              <span className="t-caption font-semibold tabular">
                {p.caption}
              </span>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2 pt-2 border-t">
        <div>
          <div className="t-caption text-text-subtle uppercase tracking-wide">
            Total change
          </div>
          <div
            className={cn(
              "t-body font-semibold tabular",
              total >= 0 ? "text-success" : "text-danger"
            )}
          >
            {total > 0 ? "+" : ""}
            {total}%
          </div>
        </div>
        <div>
          <div className="t-caption text-text-subtle uppercase tracking-wide">
            Annualised
          </div>
          <div
            className={cn(
              "t-body font-semibold tabular",
              annualised >= 0 ? "text-success" : "text-danger"
            )}
          >
            {annualised > 0 ? "+" : ""}
            {annualised}% / yr
          </div>
        </div>
      </div>
    </div>
  );
}

function ComparableSpread({
  min,
  max,
  median,
  subject,
}: {
  min: number;
  max: number;
  median: number;
  subject: number | null;
}) {
  const range = Math.max(1, max - min);
  const clamp01 = (p: number) => Math.min(1, Math.max(0, p));
  const medianPct = Math.round(clamp01((median - min) / range) * 100);
  const subjectPct =
    subject !== null
      ? Math.round(clamp01((subject - min) / range) * 100)
      : null;

  return (
    <div className="surface-flat p-4 rounded-neu flex flex-col gap-3">
      <div className="flex items-baseline justify-between t-caption text-text-muted">
        <span className="tabular">{formatMoneyNZCompact(min)}</span>
        <span className="tabular">Median {formatMoneyNZCompact(median)}</span>
        <span className="tabular">{formatMoneyNZCompact(max)}</span>
      </div>
      <div className="relative h-3 w-full rounded-neu-pill neu-inset-sm">
        <div
          className="absolute inset-y-0 rounded-neu-pill"
          style={{
            left: 0,
            width: "100%",
            background:
              "linear-gradient(90deg, rgba(0,179,131,0.28), rgba(255,122,0,0.28), rgba(255,61,113,0.28))",
          }}
          aria-hidden
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-text-muted"
          style={{ left: `calc(${medianPct}% - 1px)` }}
          aria-hidden
          title={`Median ${formatMoneyNZCompact(median)}`}
        />
        {subjectPct !== null ? (
          <div
            className="absolute -top-1.5 h-6 w-1 rounded-neu-pill"
            style={{
              left: `calc(${subjectPct}% - 2px)`,
              background: "var(--accent-gradient)",
            }}
            aria-hidden
            title={`This property ${formatMoneyNZCompact(subject ?? 0)}`}
          />
        ) : null}
      </div>
      {subject !== null ? (
        <div className="t-caption text-text-muted">
          This property estimate ({formatMoneyNZCompact(subject)}) sits{" "}
          <span className="text-text font-semibold">
            {subject >= median
              ? `${Math.round(((subject - median) / median) * 100)}% above`
              : `${Math.round(((median - subject) / median) * 100)}% below`}
          </span>{" "}
          the comparable median.
        </div>
      ) : null}
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
