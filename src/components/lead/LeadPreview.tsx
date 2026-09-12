"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  ArrowRight,
  Bed,
  Building2,
  CalendarDays,
  Home,
  Mail,
  MapPin,
  Phone,
  Ruler,
  UserRound,
  Users,
} from "lucide-react";
import type { LeadPreview as LeadPreviewData } from "@/app/api/inbox/[id]/route";
import type { Lead } from "@/lib/mock";
import { StateChip } from "@/components/lead/StateChip";
import { LoadingSkeleton } from "@/components/states/LoadingSkeleton";
import { ErrorState } from "@/components/states/ErrorState";
import { formatMoneyNZCompact, formatRelative, cn } from "@/lib/utils";

/*
 * Inbox right pane. When Sarah clicks a lead in the left list, the
 * pane fetches /api/inbox/[id] and lays out everything she needs to
 * triage before opening the full workspace:
 *
 *   - Header: address, state chip, vendor + public id
 *   - Property hero: CV vs Estimate, quick spec chips (land, floor,
 *     beds, year built), source of each headline value
 *   - Vendor row: phone, email, source, received-when
 *   - Progress row: picked / suggested agents, candidates,
 *     comparables, activity count
 *   - Primary action: Open lead (goes to the workspace)
 *
 * Falls back gracefully when we don't have a property yet or the
 * lead has no comparables.
 */

interface Props {
  lead: Lead;
}

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
    // Cheap request; refetch on focus but no polling interval — the
    // list polling already keeps things fresh at the list level.
    refetchOnWindowFocus: true,
    // Seed with what we already know from the list payload so the
    // header + vendor row render instantly.
    placeholderData: {
      lead,
      property: null,
      counts: {
        picked_agents: 0,
        suggested_agents: 0,
        candidates: 0,
        comparables: 0,
        activity: 0,
      },
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

  const { lead: full, property, counts } = data;
  const cv = property?.cv?.value ?? null;
  const est = property?.estimate?.value ?? null;
  const delta = deltaPct(cv, est);

  return (
    <div className="neu-raised p-6 flex flex-col gap-5 w-full anim-enter">
      {/* ---------- Header ---------- */}
      <div className="flex items-start justify-between gap-4">
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

      {/* ---------- Property hero (compact) ---------- */}
      <div className="surface-flat p-4 rounded-neu">
        <div className="t-caption text-text-subtle uppercase tracking-wide mb-2">
          Property snapshot
        </div>
        {cv || est ? (
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <HeroFigure label="Capital value" value={cv} />
            <DeltaChip delta={delta} />
            <HeroFigure
              label="Estimate"
              value={est}
              align="right"
            />
          </div>
        ) : (
          <p className="t-body text-text-muted">
            No property data yet — will populate as enrichment lands.
          </p>
        )}

        {property ? <PropertyChips property={property} /> : null}
      </div>

      {/* ---------- Vendor + source row ---------- */}
      <div className="grid grid-cols-2 gap-3">
        <ContactCard
          icon={<Phone size={13} />}
          label="Phone"
          value={full.phone || "—"}
          href={full.phone ? `tel:${full.phone.replace(/\s+/g, "")}` : undefined}
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

      {/* ---------- Progress row ---------- */}
      <div className="flex flex-wrap items-center gap-3">
        <CountPill
          icon={<Users size={12} />}
          label="Picked"
          value={counts.picked_agents}
          highlight={counts.picked_agents > 0}
        />
        <CountPill
          icon={<Users size={12} />}
          label="Suggested"
          value={counts.suggested_agents}
        />
        <CountPill
          icon={<UserRound size={12} />}
          label="Candidates"
          value={counts.candidates}
        />
        <CountPill
          icon={<Home size={12} />}
          label="Comparables"
          value={counts.comparables}
        />
        <CountPill
          icon={<CalendarDays size={12} />}
          label="Activity"
          value={counts.activity}
        />
      </div>

      {/* ---------- Primary CTA ---------- */}
      <div className="pt-1">
        <Link href={`/leads/${full.id}`} className="btn-accent-glass">
          Open lead
          <ArrowRight size={16} />
        </Link>
      </div>
    </div>
  );
}

/* ---------------- helpers ---------------- */

function HeroFigure({
  label,
  value,
  align = "left",
}: {
  label: string;
  value: number | null;
  align?: "left" | "right";
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
      <span className="t-section tabular leading-none">
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

function PropertyChips({
  property,
}: {
  property: NonNullable<LeadPreviewData["property"]>;
}) {
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
    <div className="flex flex-wrap gap-2 mt-3">
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
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 rounded-neu-pill neu-raised-sm",
        highlight && "text-accent"
      )}
    >
      {icon}
      <span className="t-caption uppercase tracking-wide">{label}</span>
      <span className="t-body font-semibold tabular">{value}</span>
    </div>
  );
}

function deltaPct(cv: number | null, est: number | null): number | null {
  if (cv === null || est === null || cv === 0) return null;
  return Math.round(((est - cv) / cv) * 100);
}
