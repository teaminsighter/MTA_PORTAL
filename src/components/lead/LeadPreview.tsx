"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useCallback } from "react";
import {
  Activity,
  ArrowRight,
  Bed,
  Building2,
  CalendarDays,
  Home,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Ruler,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";
import type { LeadPreview as LeadPreviewData } from "@/app/api/inbox/[id]/route";
import type { Lead, PropertyFacts, Provenance } from "@/lib/mock";
import { StateChip } from "@/components/lead/StateChip";
import { LoadingSkeleton } from "@/components/states/LoadingSkeleton";
import { ErrorState } from "@/components/states/ErrorState";
import {
  cn,
  formatDateNZ,
  formatMoneyNZ,
  formatMoneyNZCompact,
  formatRelative,
} from "@/lib/utils";

/*
 * Inbox right pane — rich lead dashboard.
 *
 * Everything Sarah needs to triage a lead without leaving the inbox.
 * Sections stacked top-to-bottom (pane scrolls when tall):
 *
 *   1. Header — address, vendor, state chip, public id
 *   2. Property snapshot — CV | Δ | Estimate hero + spec chips
 *   3. Full property facts grid — every value with source + fetched
 *   4. Contact — phone, email, source, received
 *   5. Progress pills — picked / suggested / candidates / comps / activity
 *   6. Nearby sales — top 5 comparables in a tight flat panel
 *   7. Picked agents — small cards for each currently-picked agent
 *   8. Recent activity — compact timeline of last 5 events
 *   9. Open lead CTA
 */

interface Props {
  lead: Lead;
}

const EMPTY_COUNTS: LeadPreviewData["counts"] = {
  picked_agents: 0,
  suggested_agents: 0,
  candidates: 0,
  comparables: 0,
  activity: 0,
};

export function LeadPreview({ lead }: Props) {
  const query = useQuery<LeadPreviewData>({
    queryKey: ["inbox-preview", lead.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/inbox/${encodeURIComponent(lead.id)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`preview fetch failed: ${res.status}`);
      return res.json();
    },
    refetchOnWindowFocus: true,
    placeholderData: {
      lead,
      property: null,
      picked_agents: [],
      comparables: [],
      activity: [],
      counts: EMPTY_COUNTS,
    },
  });

  if (query.isError) {
    return (
      <div className="neu-raised p-6 w-full">
        <ErrorState onRetry={() => query.refetch()} />
      </div>
    );
  }

  const data = query.data;
  if (!data) {
    return (
      <div className="neu-raised p-6 w-full">
        <LoadingSkeleton rows={4} />
      </div>
    );
  }

  const { lead: full, property, counts, picked_agents, comparables, activity } =
    data;
  const cv = property?.cv?.value ?? null;
  const est = property?.estimate?.value ?? null;
  const delta = deltaPct(cv, est);
  const pricePerSqm =
    est && property?.floor_area?.value
      ? Math.round(est / property.floor_area.value)
      : null;

  const heroImageUrl = `https://picsum.photos/seed/${encodeURIComponent(
    full.id
  )}/960/360`;

  return (
    <div className="neu-raised p-6 flex flex-col gap-4 w-full anim-enter max-h-[calc(100dvh-8rem)] relative">
      {/* ---------- Header (pinned) ---------- */}
      <div className="flex items-start justify-between gap-4 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-2 t-caption text-text-muted">
            <MapPin size={12} />
            <span className="tabular">{full.id}</span>
          </div>
          <h2 className="t-section leading-tight">{full.address}</h2>
          <div className="t-body text-text-muted flex items-center gap-2 mt-1">
            <UserRound size={13} /> {full.vendor_name}
          </div>
        </div>
        <StateChip state={full.state} />
      </div>

      {/* ---------- Scrolling body ---------- */}
      {/* pb-16 leaves clearance so the floating CTA never sits on top
          of the last section's content when scrolled to the end. */}
      <div
        id="lead-preview-scroll"
        className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-6 -mr-2 pr-2 pb-16"
      >
      {/* ---------- Property snapshot ---------- */}
      <Section title="Property snapshot" icon={<Home size={12} />}>
        {cv || est ? (
          <div className="surface-flat p-4 rounded-neu flex flex-col gap-3">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
              <HeroFigure label="Capital value" value={cv} align="left" />
              <DeltaChip delta={delta} />
              <HeroFigure label="Estimate" value={est} align="right" />
            </div>
            {property ? <PropertyChips property={property} /> : null}
          </div>
        ) : (
          <p className="t-body text-text-muted">
            No property data yet — will populate as enrichment lands.
          </p>
        )}
      </Section>

      {/* ---------- Full property facts ---------- */}
      {property ? (
        <Section
          title="Facts & provenance"
          icon={<TrendingUp size={12} />}
        >
          <div className="grid grid-cols-2 gap-2">
            <FactRow label="Capital value" prov={property.cv} kind="money" />
            <FactRow label="Estimate" prov={property.estimate} kind="money" />
            <FactRow
              label="Land value"
              prov={property.land_value}
              kind="money"
            />
            <FactRow
              label="Improvements"
              prov={property.improvements}
              kind="money"
            />
            <FactRow
              label="Land area"
              prov={property.land_area}
              kind="area"
            />
            <FactRow
              label="Floor area"
              prov={property.floor_area}
              kind="area"
            />
            <FactRow label="Bedrooms" prov={property.bedrooms} kind="int" />
            <FactRow
              label="Year built"
              prov={property.year_built}
              kind="year"
            />
            <FactRow
              label="Last sold date"
              prov={property.last_sold_date}
              kind="date"
            />
            <FactRow
              label="Last sold price"
              prov={property.last_sold_price}
              kind="money"
            />
            {pricePerSqm ? (
              <div className="col-span-2 flex items-baseline justify-between gap-3 t-caption text-text-muted border-t pt-2">
                <span>Estimated $/m² (floor)</span>
                <span className="tabular font-semibold text-text">
                  {formatMoneyNZ(pricePerSqm)} / m²
                </span>
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}

      {/* ---------- Contact ---------- */}
      <Section title="Vendor & source" icon={<UserRound size={12} />}>
        <div className="grid grid-cols-2 gap-3">
          <ContactCard
            icon={<Phone size={13} />}
            label="Phone"
            value={full.phone || "—"}
            href={
              full.phone ? `tel:${full.phone.replace(/\s+/g, "")}` : undefined
            }
          />
          <ContactCard
            icon={<Mail size={13} />}
            label="Email"
            value={full.email || "—"}
            href={full.email ? `mailto:${full.email}` : undefined}
          />
          <MetaCard
            label="Source"
            value={
              full.source === "web"
                ? "Web form"
                : full.source === "ac_manual"
                  ? "AC manual"
                  : full.source === "ac_import"
                    ? "AC import"
                    : "Seed placeholder"
            }
          />
          <MetaCard
            label="Received"
            value={formatRelative(full.created_at)}
            icon={<CalendarDays size={13} />}
          />
        </div>
      </Section>

      {/* ---------- Progress ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <CountPill
          icon={<Users size={12} />}
          label="Picked"
          value={counts.picked_agents}
          highlight={counts.picked_agents > 0}
          targetId="picked-agents"
        />
        <CountPill
          icon={<Users size={12} />}
          label="Suggested"
          value={counts.suggested_agents}
          href={`/leads/${full.id}#shortlist`}
        />
        <CountPill
          icon={<UserRound size={12} />}
          label="Candidates"
          value={counts.candidates}
          href={`/leads/${full.id}#candidates`}
        />
        <CountPill
          icon={<Home size={12} />}
          label="Comparables"
          value={counts.comparables}
          targetId="nearby-sales"
        />
        <CountPill
          icon={<Activity size={12} />}
          label="Activity"
          value={counts.activity}
          targetId="recent-activity"
        />
      </div>

      {/* ---------- Nearby sales (comparables) ---------- */}
      {comparables.length > 0 ? (
        <Section
          id="nearby-sales"
          title={`Nearby sales · top ${comparables.length}${
            counts.comparables > comparables.length
              ? ` of ${counts.comparables}`
              : ""
          }`}
          icon={<Home size={12} />}
        >
          <div className="surface-flat overflow-hidden rounded-neu">
            <div className="overflow-x-auto">
              <table className="w-full t-body">
                <thead className="bg-surface-elevated text-text-muted">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">
                      Address
                    </th>
                    <th className="text-right px-3 py-2 font-medium">
                      Sale
                    </th>
                    <th className="text-right px-3 py-2 font-medium">
                      vs CV
                    </th>
                    <th className="text-right px-3 py-2 font-medium">
                      Distance
                    </th>
                    <th className="text-right px-3 py-2 font-medium">
                      Sold
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {comparables.map((c, i) => {
                    const compDelta = Math.round(
                      ((c.sale_price - c.cv_at_sale) / c.cv_at_sale) * 100
                    );
                    const tone =
                      compDelta > 3
                        ? "chip-success"
                        : compDelta < -3
                          ? "chip-danger"
                          : "chip-neutral";
                    return (
                      <tr
                        key={c.address}
                        className={i % 2 === 1 ? "bg-surface-elevated" : ""}
                      >
                        <td className="px-3 py-2 truncate max-w-[160px]">
                          {c.address}
                        </td>
                        <td className="px-3 py-2 text-right tabular">
                          {formatMoneyNZCompact(c.sale_price)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className={cn("chip tabular", tone)}>
                            {compDelta > 0 ? "+" : ""}
                            {compDelta}%
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular">
                          {c.distance_m} m
                        </td>
                        <td className="px-3 py-2 text-right tabular text-text-muted">
                          {formatDateNZ(c.sale_date)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      ) : null}

      {/* ---------- Picked agents ---------- */}
      {picked_agents.length > 0 ? (
        <Section
          id="picked-agents"
          title={`Picked agents · ${counts.picked_agents}${
            counts.picked_agents > picked_agents.length
              ? ` (top ${picked_agents.length})`
              : ""
          }`}
          icon={<Users size={12} />}
        >
          <ul className="flex flex-col gap-2">
            {picked_agents.map((a) => (
              <li
                key={a.id}
                className="neu-raised-sm px-3 py-2 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="t-body font-semibold truncate">{a.name}</div>
                  <div className="t-caption text-text-muted truncate">
                    {a.agency}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {a.membership_status === "signed" ? (
                    <span className="chip chip-success">Signed</span>
                  ) : (
                    <span className="chip chip-warning">Verbal</span>
                  )}
                  {a.sms_permission ? (
                    <span className="chip chip-info">
                      <MessageSquare size={11} /> SMS
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {/* ---------- Recent activity ---------- */}
      {activity.length > 0 ? (
        <Section id="recent-activity" title="Recent activity" icon={<Activity size={12} />}>
          <ol className="surface-flat divide-y rounded-neu">
            {activity.map((e, i) => (
              <li key={i} className="flex items-start gap-3 px-3 py-2">
                <span
                  aria-hidden
                  className="mt-1.5 h-1.5 w-1.5 rounded-neu-pill shrink-0"
                  style={{ background: "var(--accent-gradient)" }}
                />
                <div className="min-w-0 flex-1">
                  <div className="t-body truncate">{e.detail}</div>
                  <div className="t-caption text-text-subtle tabular">
                    {formatRelative(e.at)}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}

      {/* ---------- Bottom row: data sources · property image ---------- */}
      {/* Two lower-priority panels get equal room here, out of the way
          of the primary triage data above. Stacks on narrow panes. */}
      {property ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Section
            id="data-sources"
            title="Data sources"
            icon={<Building2 size={12} />}
          >
            <DataSourcesCard property={property} />
          </Section>
          <Section title="Property image" icon={<Home size={12} />}>
            <div className="relative w-full aspect-[4/3] rounded-neu overflow-hidden surface-flat">
              <Image
                src={heroImageUrl}
                alt=""
                fill
                sizes="(min-width: 1024px) 20vw, 100vw"
                className="object-cover"
                unoptimized
              />
              <div
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(0,0,0,0) 60%, rgba(0,0,0,0.4) 100%)",
                }}
              />
              <div className="absolute bottom-2 left-3 right-3 t-caption text-white/90 flex items-center gap-1 truncate">
                <MapPin size={11} className="shrink-0" />
                <span className="truncate">{full.address}</span>
              </div>
            </div>
          </Section>
        </div>
      ) : null}

      </div>
      {/* ---------- Primary CTA (floats bottom-right over scroll) ---------- */}
      <Link
        href={`/leads/${full.id}`}
        className="btn-accent-glass absolute bottom-4 right-4 z-10 shadow-lg"
      >
        Open lead
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}

/* ---------------- section wrapper ---------------- */

function Section({
  id,
  title,
  icon,
  children,
}: {
  id?: string;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="flex flex-col gap-2 scroll-mt-2">
      <div className="t-caption text-text-subtle uppercase tracking-wide flex items-center gap-1">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

/* ---------------- primitives ---------------- */

function HeroFigure({
  label,
  value,
  align,
}: {
  label: string;
  value: number | null;
  align: "left" | "right";
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 min-w-0",
        align === "right" ? "items-end text-right" : "items-start text-left"
      )}
    >
      <span className="t-caption text-text-subtle uppercase tracking-wide">
        {label}
      </span>
      <span
        className="t-section tabular leading-none"
        title={value != null ? formatMoneyNZ(value) : "—"}
      >
        {value != null ? formatMoneyNZCompact(value) : "—"}
      </span>
    </div>
  );
}

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="chip chip-neutral">Δ —</span>;
  }
  const tone =
    delta >= 8
      ? "chip-success"
      : delta <= -8
        ? "chip-danger"
        : Math.abs(delta) <= 3
          ? "chip-neutral"
          : "chip-warning";
  const label = `${delta > 0 ? "+" : ""}${delta}%`;
  return (
    <span className={cn("chip tabular", tone)} aria-label={`Δ ${label}`}>
      Δ {label}
    </span>
  );
}

function PropertyChips({ property }: { property: PropertyFacts }) {
  const chips: { icon: React.ReactNode; text: string }[] = [];
  if (property.land_area?.value)
    chips.push({
      icon: <Ruler size={11} />,
      text: `${property.land_area.value.toLocaleString("en-NZ")} m² land`,
    });
  if (property.floor_area?.value)
    chips.push({
      icon: <Building2 size={11} />,
      text: `${property.floor_area.value.toLocaleString("en-NZ")} m² floor`,
    });
  if (property.bedrooms?.value)
    chips.push({
      icon: <Bed size={11} />,
      text: `${property.bedrooms.value} bed`,
    });
  if (property.year_built?.value)
    chips.push({
      icon: <Home size={11} />,
      text: `built ${property.year_built.value}`,
    });

  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <span
          key={c.text}
          className="chip chip-neutral flex items-center gap-1"
        >
          {c.icon}
          {c.text}
        </span>
      ))}
    </div>
  );
}

type FactKind = "money" | "area" | "int" | "year" | "date";

function FactRow({
  label,
  prov,
  kind,
}: {
  label: string;
  prov: Provenance<number> | Provenance<string> | undefined;
  kind: FactKind;
}) {
  const value = renderFact(prov?.value, kind);
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <div className="flex flex-col min-w-0">
        <span className="t-caption text-text-muted">{label}</span>
        {prov ? (
          <span className="t-caption text-text-subtle tabular">
            {prov.source === "manual" ? "manual" : `from ${prov.source}`}
            {" · "}
            {formatRelative(prov.fetched_at)}
          </span>
        ) : null}
      </div>
      <span
        className={cn(
          "t-body tabular font-semibold text-right",
          !prov && "text-text-subtle"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function renderFact(value: number | string | undefined, kind: FactKind): string {
  if (value === undefined || value === null || value === "") return "—";
  switch (kind) {
    case "money":
      return typeof value === "number" ? formatMoneyNZ(value) : "—";
    case "area":
      return typeof value === "number"
        ? `${value.toLocaleString("en-NZ")} m²`
        : "—";
    case "int":
      return typeof value === "number" ? String(value) : "—";
    case "year":
      return typeof value === "number" ? String(value) : "—";
    case "date":
      return typeof value === "string" ? formatDateNZ(value) : "—";
  }
}

function ContactCard({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <div className="neu-inset-sm p-3 rounded-neu-sm">
      <div className="t-caption text-text-subtle uppercase tracking-wide flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="t-body font-medium tabular truncate">{value}</div>
    </div>
  );
  if (href) {
    return (
      <a href={href} className="min-w-0 block">
        {inner}
      </a>
    );
  }
  return <div className="min-w-0">{inner}</div>;
}

function MetaCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="neu-inset-sm p-3 rounded-neu-sm min-w-0">
      <div className="t-caption text-text-subtle uppercase tracking-wide flex items-center gap-1">
        {icon}
        {label}
      </div>
      <div className="t-body font-medium truncate">{value}</div>
    </div>
  );
}

function CountPill({
  icon,
  label,
  value,
  highlight,
  targetId,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
  /* Section id inside the preview pane — clicking scrolls to it. */
  targetId?: string;
  /* Full-lead workspace anchor for pills that have no preview section. */
  href?: string;
}) {
  const isInteractive = value > 0 && (targetId || href);
  const scrollTo = useCallback(() => {
    if (!targetId) return;
    const scroller = document.getElementById("lead-preview-scroll");
    const el = document.getElementById(targetId);
    if (!scroller || !el) return;
    const top = el.offsetTop - scroller.offsetTop;
    scroller.scrollTo({ top, behavior: "smooth" });
  }, [targetId]);

  const cls = cn(
    "flex items-center gap-2 px-3 py-1.5 rounded-neu-pill neu-raised-sm transition-transform",
    isInteractive && "hover:-translate-y-0.5 hover:text-accent cursor-pointer",
    !isInteractive && "opacity-70 cursor-default",
    highlight && "text-accent"
  );

  const inner = (
    <>
      {icon}
      <span className="t-caption uppercase tracking-wide">{label}</span>
      <span className="t-body font-semibold tabular">{value}</span>
    </>
  );

  if (isInteractive && href) {
    return (
      <Link href={href} className={cls} aria-label={`${label}: ${value}`}>
        {inner}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={scrollTo}
      disabled={!isInteractive}
      className={cls}
      aria-label={`${label}: ${value}`}
    >
      {inner}
    </button>
  );
}

function deltaPct(cv: number | null, est: number | null): number | null {
  if (cv === null || est === null || cv === 0) return null;
  return Math.round(((est - cv) / cv) * 100);
}

/* ---------------- data sources card ---------------- */

/*
 * Per-provider label + confidence (used to derive the "matched" count).
 * Confidence is what we expect against cross-source cross-validation:
 * cotality is our canonical valuation authority; homes.co.nz agrees
 * ~92% on sold prices / estimates; corelogic occasionally disagrees
 * on physical facts; LINZ is authoritative for cadastral land area.
 * Numbers here are demo values until Phase 2 wires real diffing.
 */
const SOURCE_META: Record<
  string,
  { label: string; confidence: number; hue: string }
> = {
  cotality: { label: "Cotality", confidence: 1.0, hue: "#FF7A00" },
  homes: { label: "Homes.co.nz", confidence: 0.92, hue: "#FF3D71" },
  corelogic: { label: "CoreLogic", confidence: 0.88, hue: "#3366FF" },
  linz: { label: "LINZ", confidence: 1.0, hue: "#00B383" },
  manual: { label: "Manual override", confidence: 1.0, hue: "#8B5CF6" },
};

function DataSourcesCard({ property }: { property: PropertyFacts }) {
  const fields: Array<{ source: string; fetched_at: string } | undefined> = [
    property.cv,
    property.estimate,
    property.land_value,
    property.improvements,
    property.land_area,
    property.floor_area,
    property.bedrooms,
    property.year_built,
    property.last_sold_date,
    property.last_sold_price,
  ];
  const present = fields.filter(
    (f): f is { source: string; fetched_at: string } => !!f
  );
  const total = present.length;

  const bySource = new Map<
    string,
    { fetched: number; latest: string }
  >();
  for (const f of present) {
    const cur = bySource.get(f.source) ?? { fetched: 0, latest: f.fetched_at };
    cur.fetched += 1;
    if (f.fetched_at > cur.latest) cur.latest = f.fetched_at;
    bySource.set(f.source, cur);
  }

  const rows = [...bySource.entries()]
    .map(([source, x]) => {
      const meta = SOURCE_META[source] ?? {
        label: source,
        confidence: 1,
        hue: "var(--accent)",
      };
      const matched = Math.round(x.fetched * meta.confidence);
      return {
        source,
        label: meta.label,
        hue: meta.hue,
        fetched: x.fetched,
        matched,
        coverage: total ? Math.round((x.fetched / total) * 100) : 0,
        latest: x.latest,
      };
    })
    .sort((a, b) => b.coverage - a.coverage);

  const totalMatched = rows.reduce((s, r) => s + r.matched, 0);
  const matchRate = total ? Math.round((totalMatched / total) * 100) : 0;

  return (
    <div className="surface-flat p-4 rounded-neu flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="t-body text-text-muted">
          Enriched from {rows.length} source{rows.length === 1 ? "" : "s"}
        </span>
        <span className="t-caption text-text-subtle tabular">
          {total} fields · {matchRate}% cross-matched
        </span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <li key={r.source} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-neu-pill shrink-0"
                  style={{ background: r.hue }}
                />
                <span className="t-body font-medium truncate">{r.label}</span>
              </div>
              <div className="flex items-center gap-2 t-caption text-text-muted tabular shrink-0">
                <span title={`${r.fetched} of ${total} fields`}>
                  {r.fetched}/{total} fetched
                </span>
                <span aria-hidden>·</span>
                <span
                  className={cn(
                    r.matched === r.fetched ? "text-text" : "text-warning"
                  )}
                  title={`${r.matched} matched against other sources`}
                >
                  {r.matched}/{r.fetched} matched
                </span>
              </div>
            </div>
            <div
              className="h-1.5 w-full rounded-neu-pill overflow-hidden neu-inset-sm"
              aria-hidden
            >
              <div
                className="h-full rounded-neu-pill"
                style={{
                  width: `${r.coverage}%`,
                  background: r.hue,
                }}
              />
            </div>
            <div className="flex items-center justify-between t-caption text-text-subtle">
              <span className="tabular">{r.coverage}% of enrichment</span>
              <span className="tabular">
                fetched {formatRelative(r.latest)}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
