"use client";

import Image from "next/image";
import {
  Building2,
  CalendarDays,
  Compass,
  FileText,
  Mail,
  MapPin,
  Pencil,
  Phone,
  TrendingUp,
  UserRound,
} from "lucide-react";
import type { Lead, PropertyFacts } from "@/lib/mock";
import {
  cn,
  formatDateNZ,
  formatMoneyNZ,
  formatMoneyNZCompact,
  formatRelative,
} from "@/lib/utils";

/*
 * Formal property report.
 *
 * Sits inside the Report tab of the /leads workspace. Reads like a
 * page from an appraisal PDF — hero image, an auto-generated
 * narrative paragraph, then a series of report sections (location,
 * vendor, sale history, data sources footer). PropertyHero above
 * still owns the interactive edit surface; this card is the
 * shareable human view.
 */

interface Props {
  lead: Lead;
  property: PropertyFacts;
}

export function PropertyReport({ lead, property }: Props) {
  const heroUrl = `https://picsum.photos/seed/${encodeURIComponent(
    lead.id
  )}/1200/500`;
  const narrative = buildNarrative(lead, property);
  const generatedAt = latestFetchedAt(property) ?? new Date().toISOString();
  const location = parseAddress(lead.address);
  const sources = collectSources(property);

  return (
    <section className="neu-raised overflow-hidden flex flex-col">
      {/* --- Hero image with report chrome --- */}
      <div className="relative w-full aspect-[21/9] bg-surface-elevated">
        <Image
          src={heroUrl}
          alt=""
          fill
          sizes="(min-width: 768px) 40vw, 100vw"
          className="object-cover"
          unoptimized
          priority={false}
        />
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.55) 100%)",
          }}
        />
        <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
          <span className="chip flex items-center gap-1 bg-white/90 text-text backdrop-blur-sm">
            <FileText size={11} />
            Property report
          </span>
          <a
            href="#property-edit"
            className="chip flex items-center gap-1 bg-white/90 text-text hover:text-accent backdrop-blur-sm"
            aria-label="Edit property data"
            title="Edit property data"
          >
            <Pencil size={11} />
            Edit
          </a>
        </div>
        <div className="absolute bottom-3 left-4 right-4 text-white">
          <div className="t-caption opacity-85 tabular flex items-center gap-2">
            <span>{lead.id}</span>
            <span aria-hidden>·</span>
            <span>Generated {formatDateNZ(generatedAt)}</span>
          </div>
          <div className="t-section flex items-center gap-2 leading-tight mt-0.5">
            <MapPin size={16} className="shrink-0 opacity-90" />
            <span className="truncate">{lead.address}</span>
          </div>
        </div>
      </div>

      {/* --- Body --- */}
      <div className="p-6 flex flex-col gap-6">
        {/* Narrative */}
        <ReportSection
          title="About this property"
          icon={<FileText size={12} />}
        >
          <p className="t-body leading-relaxed text-text">{narrative}</p>
        </ReportSection>

        {/* Key stats grid */}
        <ReportSection
          title="Key facts"
          icon={<TrendingUp size={12} />}
        >
          <KeyStats property={property} />
        </ReportSection>

        {/* Location & area */}
        <ReportSection
          title="Location & area"
          icon={<Compass size={12} />}
        >
          <LocationCard address={lead.address} location={location} />
        </ReportSection>

        {/* Vendor & contact */}
        <ReportSection
          title="Vendor & contact"
          icon={<UserRound size={12} />}
        >
          <VendorPanel lead={lead} />
        </ReportSection>

        {/* Sale history */}
        {property.last_sold_date?.value || property.last_sold_price?.value ? (
          <ReportSection
            title="Sale history"
            icon={<CalendarDays size={12} />}
          >
            <SaleHistory property={property} />
          </ReportSection>
        ) : null}

        {/* Data-source footer */}
        {sources.length > 0 ? (
          <div className="t-caption text-text-subtle border-t pt-4">
            Compiled from{" "}
            {sources.map((s, i) => (
              <span key={s.source}>
                {i > 0 ? (i === sources.length - 1 ? " and " : ", ") : ""}
                <span className="text-text-muted font-medium">
                  {s.label}
                </span>
              </span>
            ))}
            . Latest fetch {formatRelative(generatedAt)}.
          </div>
        ) : null}
      </div>
    </section>
  );
}

/* ---------------- section wrapper ---------------- */

function ReportSection({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="t-caption text-text-subtle uppercase tracking-wide flex items-center gap-1.5">
        {icon}
        {title}
      </div>
      {children}
    </section>
  );
}

/* ---------------- key stats strip ---------------- */

function KeyStats({ property }: { property: PropertyFacts }) {
  const cv = property.cv?.value;
  const est = property.estimate?.value;
  const delta =
    cv && est ? Math.round(((est - cv) / cv) * 100) : null;
  const pricePerSqm =
    est && property.floor_area?.value
      ? Math.round(est / property.floor_area.value)
      : null;

  const items: Array<{ label: string; value: string; tone?: string } | null> = [
    cv
      ? {
          label: "Capital value",
          value: formatMoneyNZCompact(cv),
        }
      : null,
    est
      ? {
          label: "Estimate",
          value: formatMoneyNZCompact(est),
        }
      : null,
    delta != null
      ? {
          label: "Δ vs CV",
          value: `${delta > 0 ? "+" : ""}${delta}%`,
          tone:
            delta >= 8
              ? "text-success"
              : delta <= -8
                ? "text-danger"
                : "text-text",
        }
      : null,
    property.land_area?.value
      ? {
          label: "Land",
          value: `${property.land_area.value.toLocaleString("en-NZ")} m²`,
        }
      : null,
    property.floor_area?.value
      ? {
          label: "Floor",
          value: `${property.floor_area.value.toLocaleString("en-NZ")} m²`,
        }
      : null,
    property.bedrooms?.value
      ? { label: "Bedrooms", value: String(property.bedrooms.value) }
      : null,
    property.year_built?.value
      ? { label: "Year built", value: String(property.year_built.value) }
      : null,
    property.last_sold_price?.value
      ? {
          label: "Last sold",
          value: formatMoneyNZCompact(property.last_sold_price.value),
        }
      : null,
    pricePerSqm
      ? {
          label: "Est. $/m²",
          value: formatMoneyNZ(pricePerSqm),
        }
      : null,
  ];
  const present = items.filter(
    (i): i is { label: string; value: string; tone?: string } => !!i
  );
  if (present.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {present.map((s) => (
        <div key={s.label} className="neu-inset-sm p-2.5 rounded-neu-sm">
          <div className="t-caption text-text-subtle uppercase tracking-wide">
            {s.label}
          </div>
          <div className={cn("t-body font-semibold tabular", s.tone)}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- location card ---------------- */

interface Location {
  street: string | null;
  suburb: string | null;
  city: string | null;
  region: string | null;
  postcode: string | null;
}

function LocationCard({
  address,
  location,
}: {
  address: string;
  location: Location;
}) {
  const chips = [
    location.postcode ? { label: "Postcode", value: location.postcode } : null,
    location.region ? { label: "Region", value: location.region } : null,
    { label: "Country", value: "New Zealand" },
  ].filter((c): c is { label: string; value: string } => !!c);

  const osmSearch = `https://www.openstreetmap.org/search?query=${encodeURIComponent(
    address
  )}`;

  return (
    <div className="surface-flat rounded-neu overflow-hidden">
      {/* Decorative map-like tile: layered gradients + grid + pin.
          No external tile server required — reads as "location" at
          a glance without pulling live map data during demo. */}
      <div
        className="relative w-full aspect-[16/9] flex items-center justify-center"
        style={{
          background:
            "linear-gradient(135deg, #E8ECF2 0%, #F5F7FA 100%)",
        }}
        aria-hidden
      >
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              "linear-gradient(0deg, rgba(0,0,0,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.08) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div
          className="absolute"
          style={{
            width: 260,
            height: 12,
            top: "52%",
            left: "18%",
            background:
              "linear-gradient(90deg, rgba(255,122,0,0.0), rgba(255,122,0,0.6), rgba(255,122,0,0.0))",
            borderRadius: 6,
            transform: "rotate(-8deg)",
          }}
        />
        <div
          className="absolute"
          style={{
            width: 180,
            height: 8,
            top: "38%",
            left: "45%",
            background:
              "linear-gradient(90deg, rgba(51,102,255,0.0), rgba(51,102,255,0.55), rgba(51,102,255,0.0))",
            borderRadius: 4,
            transform: "rotate(14deg)",
          }}
        />
        <div className="relative flex flex-col items-center gap-1">
          <span
            className="relative flex h-9 w-9 items-center justify-center rounded-neu-pill text-on-accent shadow-lg anim-call-ring"
            style={{ background: "var(--accent-gradient)" }}
          >
            <MapPin size={16} />
          </span>
          <span className="t-caption font-semibold text-text bg-white/85 px-2 py-0.5 rounded-neu-sm">
            {location.suburb ?? "This property"}
          </span>
        </div>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {location.street ? (
            <LocRow label="Street" value={location.street} />
          ) : null}
          {location.suburb ? (
            <LocRow label="Suburb" value={location.suburb} />
          ) : null}
          {location.city ? (
            <LocRow label="City" value={location.city} />
          ) : null}
          {location.postcode ? (
            <LocRow label="Postcode" value={location.postcode} />
          ) : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <span
              key={c.label}
              className="chip chip-neutral"
              title={c.label}
            >
              {c.value}
            </span>
          ))}
        </div>
        <a
          href={osmSearch}
          target="_blank"
          rel="noreferrer noopener"
          className="t-caption text-accent hover:underline self-start"
        >
          Open in OpenStreetMap ↗
        </a>
      </div>
    </div>
  );
}

function LocRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="neu-inset-sm p-2.5 rounded-neu-sm min-w-0">
      <div className="t-caption text-text-subtle uppercase tracking-wide">
        {label}
      </div>
      <div className="t-body font-medium truncate">{value}</div>
    </div>
  );
}

/* ---------------- vendor panel ---------------- */

function VendorPanel({ lead }: { lead: Lead }) {
  type Row = {
    icon: React.ReactNode;
    label: string;
    value: string;
    href?: string;
  };
  const rows: Row[] = [
    { icon: <UserRound size={13} />, label: "Vendor", value: lead.vendor_name },
  ];
  if (lead.phone) {
    rows.push({
      icon: <Phone size={13} />,
      label: "Phone",
      value: lead.phone,
      href: `tel:${lead.phone.replace(/\s+/g, "")}`,
    });
  }
  if (lead.email) {
    rows.push({
      icon: <Mail size={13} />,
      label: "Email",
      value: lead.email,
      href: `mailto:${lead.email}`,
    });
  }
  rows.push({
    icon: <Building2 size={13} />,
    label: "Source",
    value:
      lead.source === "web"
        ? "Web form"
        : lead.source === "ac_manual"
          ? "AC manual"
          : lead.source === "ac_import"
            ? "AC import"
            : "Seed placeholder",
  });
  rows.push({
    icon: <CalendarDays size={13} />,
    label: "Received",
    value: formatRelative(lead.created_at),
  });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      {rows.map((r) => {
        const inner = (
          <div className="neu-inset-sm p-3 rounded-neu-sm">
            <div className="t-caption text-text-subtle uppercase tracking-wide flex items-center gap-1">
              {r.icon}
              {r.label}
            </div>
            <div className="t-body font-medium tabular truncate">{r.value}</div>
          </div>
        );
        return r.href ? (
          <a
            key={r.label}
            href={r.href}
            className="min-w-0 block hover:text-accent"
          >
            {inner}
          </a>
        ) : (
          <div key={r.label} className="min-w-0">
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- sale history ---------------- */

function SaleHistory({ property }: { property: PropertyFacts }) {
  const soldPrice = property.last_sold_price?.value;
  const soldDate = property.last_sold_date?.value;
  const cv = property.cv?.value;
  const est = property.estimate?.value;

  // Annualised growth from last sold price → current estimate.
  let annualised: number | null = null;
  if (soldPrice && soldDate && est) {
    const soldYear = new Date(soldDate).getFullYear();
    const nowYear = new Date().getFullYear();
    const years = Math.max(1, nowYear - soldYear);
    const totalGrowth = est / soldPrice;
    annualised = Math.round((Math.pow(totalGrowth, 1 / years) - 1) * 100);
  }

  return (
    <div className="surface-flat p-4 rounded-neu flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {soldDate ? (
          <Milestone
            label="Last sold"
            value={formatDateNZ(soldDate)}
            sub={soldPrice ? formatMoneyNZ(soldPrice) : "—"}
          />
        ) : null}
        {cv ? (
          <Milestone
            label="Current CV"
            value={formatMoneyNZCompact(cv)}
            sub={
              soldPrice
                ? `${changePct(soldPrice, cv)} since sale`
                : undefined
            }
          />
        ) : null}
        {est ? (
          <Milestone
            label="Market estimate"
            value={formatMoneyNZCompact(est)}
            sub={
              annualised != null
                ? `≈${annualised > 0 ? "+" : ""}${annualised}%/yr`
                : undefined
            }
            highlight
          />
        ) : null}
      </div>
      {soldPrice && est ? (
        <div className="t-caption text-text-muted">
          Owner has held the property for{" "}
          <span className="text-text font-semibold">
            {soldDate
              ? `${Math.max(1, new Date().getFullYear() - new Date(soldDate).getFullYear())} year${
                  new Date().getFullYear() -
                    new Date(soldDate).getFullYear() ===
                  1
                    ? ""
                    : "s"
                }`
              : "—"}
          </span>
          ; implied total appreciation of{" "}
          <span className="text-text font-semibold">
            {changePct(soldPrice, est)}
          </span>
          .
        </div>
      ) : null}
    </div>
  );
}

function Milestone({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "neu-inset-sm p-3 rounded-neu-sm flex flex-col gap-0.5",
        highlight && "text-accent"
      )}
    >
      <span className="t-caption text-text-subtle uppercase tracking-wide">
        {label}
      </span>
      <span className="t-section tabular leading-none">{value}</span>
      {sub ? (
        <span className="t-caption text-text-muted tabular">{sub}</span>
      ) : null}
    </div>
  );
}

/* ---------------- narrative builder ---------------- */

function buildNarrative(lead: Lead, p: PropertyFacts): string {
  const loc = parseAddress(lead.address);
  const bedrooms = p.bedrooms?.value;
  const floor = p.floor_area?.value;
  const land = p.land_area?.value;
  const yearBuilt = p.year_built?.value;
  const soldPrice = p.last_sold_price?.value;
  const soldDate = p.last_sold_date?.value;
  const cv = p.cv?.value;
  const est = p.estimate?.value;

  const sentences: string[] = [];

  const specParts: string[] = [];
  if (bedrooms) specParts.push(`${bedrooms}-bedroom`);
  if (floor) specParts.push(`${floor.toLocaleString("en-NZ")} m²`);
  const spec = specParts.join(", ");
  const landClause = land
    ? ` on ${land.toLocaleString("en-NZ")} m² of land`
    : "";
  const suburbClause = loc.suburb
    ? `${loc.city ? ` in ${loc.suburb}, ${loc.city}` : ` in ${loc.suburb}`}`
    : "";
  if (spec || landClause || suburbClause) {
    sentences.push(
      `This ${spec || "residential"} property${landClause}${suburbClause}.`.replace(
        /  +/g,
        " "
      )
    );
  }

  if (yearBuilt) {
    const age = new Date().getFullYear() - yearBuilt;
    sentences.push(
      `Built in ${yearBuilt}${age > 0 ? ` (${age} year${age === 1 ? "" : "s"} old)` : ""}.`
    );
  }

  if (soldDate && soldPrice) {
    sentences.push(
      `Last changed hands on ${formatDateNZ(soldDate)} for ${formatMoneyNZ(
        soldPrice
      )}.`
    );
  } else if (soldDate) {
    sentences.push(`Last transacted ${formatDateNZ(soldDate)}.`);
  }

  if (cv && est) {
    const diff = Math.round(((est - cv) / cv) * 100);
    const trend =
      diff >= 8
        ? "well above"
        : diff >= 3
          ? "above"
          : diff >= -3
            ? "in line with"
            : diff >= -8
              ? "below"
              : "well below";
    sentences.push(
      `Cotality records the capital value at ${formatMoneyNZCompact(
        cv
      )}; the current market estimate of ${formatMoneyNZCompact(
        est
      )} sits ${trend} CV (${diff >= 0 ? "+" : ""}${diff}%).`
    );
  } else if (cv) {
    sentences.push(
      `Cotality records the capital value at ${formatMoneyNZCompact(cv)}.`
    );
  } else if (est) {
    sentences.push(
      `Current market estimate is ${formatMoneyNZCompact(est)}.`
    );
  }

  if (sentences.length === 0) {
    return "Property enrichment is still in progress. This report will fill in as data lands from Cotality, homes.co.nz, CoreLogic and LINZ.";
  }
  return sentences.join(" ");
}

/* ---------------- helpers ---------------- */

function parseAddress(address: string): Location {
  // Shape: "18 Franklin Road, Ponsonby, Auckland 1011"
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  const street = parts[0] ?? null;
  const suburb = parts.length >= 3 ? parts[1] : null;
  const cityRaw = parts[parts.length - 1] ?? null;

  let city: string | null = null;
  let postcode: string | null = null;
  if (cityRaw) {
    const m = cityRaw.match(/^(.*?)(?:\s+(\d{4}))?$/);
    city = (m?.[1] ?? cityRaw).trim() || null;
    postcode = m?.[2] ?? null;
  }
  const region = city ? deriveRegion(city) : null;
  return { street, suburb, city, region, postcode };
}

function deriveRegion(city: string): string | null {
  const c = city.toLowerCase();
  if (c.includes("auckland")) return "Auckland Region";
  if (c.includes("wellington")) return "Wellington Region";
  if (c.includes("christchurch")) return "Canterbury Region";
  if (c.includes("tauranga")) return "Bay of Plenty";
  if (c.includes("hamilton")) return "Waikato Region";
  if (c.includes("dunedin")) return "Otago Region";
  return null;
}

function collectSources(
  p: PropertyFacts
): Array<{ source: string; label: string }> {
  const labelMap: Record<string, string> = {
    cotality: "Cotality",
    homes: "Homes.co.nz",
    corelogic: "CoreLogic",
    linz: "LINZ",
    manual: "manual entries",
  };
  const seen = new Set<string>();
  const provs = [
    p.cv,
    p.estimate,
    p.land_value,
    p.improvements,
    p.land_area,
    p.floor_area,
    p.bedrooms,
    p.year_built,
    p.last_sold_date,
    p.last_sold_price,
  ];
  for (const prov of provs) {
    if (prov && !seen.has(prov.source)) seen.add(prov.source);
  }
  return [...seen].map((s) => ({ source: s, label: labelMap[s] ?? s }));
}

function latestFetchedAt(p: PropertyFacts): string | null {
  const stamps = [
    p.cv?.fetched_at,
    p.estimate?.fetched_at,
    p.land_value?.fetched_at,
    p.improvements?.fetched_at,
    p.land_area?.fetched_at,
    p.floor_area?.fetched_at,
    p.bedrooms?.fetched_at,
    p.year_built?.fetched_at,
    p.last_sold_date?.fetched_at,
    p.last_sold_price?.fetched_at,
  ].filter((s): s is string => !!s);
  if (stamps.length === 0) return null;
  return stamps.sort().pop() ?? null;
}

function changePct(from: number, to: number): string {
  const pct = Math.round(((to - from) / from) * 100);
  return `${pct > 0 ? "+" : ""}${pct}%`;
}
