"use client";

import Image from "next/image";
import { FileText, MapPin, Pencil } from "lucide-react";
import type { Lead, PropertyFacts } from "@/lib/mock";
import { formatDateNZ, formatMoneyNZ, formatMoneyNZCompact } from "@/lib/utils";

/*
 * Formal property report card.
 *
 * Sits above PropertyHero on the left column of /leads/[id]. Reads
 * like something an agent would receive from an appraisal service:
 * hero image, a narrative paragraph auto-generated from the facts,
 * and a compact key-stats strip. PropertyHero underneath still owns
 * inline edit for the actual data — this card is the human-readable
 * summary that Sarah forwards to the vendor.
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
      <div className="p-6 flex flex-col gap-4">
        <div>
          <div className="t-caption text-text-subtle uppercase tracking-wide mb-1">
            About this property
          </div>
          <p className="t-body leading-relaxed text-text">
            {narrative}
          </p>
        </div>

        <KeyStats property={property} />
      </div>
    </section>
  );
}

/* ---------------- key stats strip ---------------- */

function KeyStats({ property }: { property: PropertyFacts }) {
  const items: Array<{ label: string; value: string } | null> = [
    property.cv?.value
      ? {
          label: "Capital value",
          value: formatMoneyNZCompact(property.cv.value),
        }
      : null,
    property.estimate?.value
      ? {
          label: "Estimate",
          value: formatMoneyNZCompact(property.estimate.value),
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
  ];
  const present = items.filter(
    (i): i is { label: string; value: string } => !!i
  );
  if (present.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {present.map((s) => (
        <div key={s.label} className="neu-inset-sm p-2.5 rounded-neu-sm">
          <div className="t-caption text-text-subtle uppercase tracking-wide">
            {s.label}
          </div>
          <div className="t-body font-semibold tabular">{s.value}</div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- narrative builder ---------------- */

/*
 * Auto-generated report prose. Deliberately conservative — reads well
 * whether we have 3 fields or 10. Suburb is parsed from the free-text
 * address (last token before the postcode, if we can spot one).
 */
function buildNarrative(lead: Lead, p: PropertyFacts): string {
  const suburb = extractSuburb(lead.address);
  const bedrooms = p.bedrooms?.value;
  const floor = p.floor_area?.value;
  const land = p.land_area?.value;
  const yearBuilt = p.year_built?.value;
  const soldPrice = p.last_sold_price?.value;
  const soldDate = p.last_sold_date?.value;
  const cv = p.cv?.value;
  const est = p.estimate?.value;

  const sentences: string[] = [];

  // Opener — build the fullest sentence we can from physical facts.
  const specParts: string[] = [];
  if (bedrooms) specParts.push(`${bedrooms}-bedroom`);
  if (floor) specParts.push(`${floor.toLocaleString("en-NZ")} m²`);
  const spec = specParts.join(", ");
  const landClause = land
    ? ` on ${land.toLocaleString("en-NZ")} m² of land`
    : "";
  const suburbClause = suburb ? ` in ${suburb}` : "";
  if (spec || landClause || suburbClause) {
    sentences.push(
      `This ${spec || "residence"} property${landClause}${suburbClause}.`.replace(
        /  +/g,
        " "
      )
    );
  }

  if (yearBuilt) {
    sentences.push(`Built in ${yearBuilt}.`);
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

function extractSuburb(address: string): string | null {
  // Expected shape: "18 Franklin Road, Ponsonby, Auckland 1011".
  // Suburb is the second comma-separated token.
  const parts = address.split(",").map((p) => p.trim());
  if (parts.length >= 2) return parts[1] || null;
  return null;
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
