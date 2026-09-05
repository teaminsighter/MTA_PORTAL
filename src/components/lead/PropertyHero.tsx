import type { PropertyFacts, Provenance } from "@/lib/mock";
import { cn } from "@/lib/utils";
import {
  formatDateNZ,
  formatMoneyNZ,
  formatMoneyNZCompact,
} from "@/lib/utils";

interface PropertyHeroProps {
  property: PropertyFacts;
}

/*
 * Returns the delta between two money values and the semantic tone that
 * should paint it. Threshold tuned so real-world CV vs. estimate variance
 * (typ. 3-10%) reads as informative, not alarming.
 */
function priceDelta(
  cv?: Provenance<number>,
  est?: Provenance<number>
): { pct: number; label: string; tone: "success" | "warning" | "danger" | "neutral" } | null {
  if (!cv?.value || !est?.value) return null;
  const pct = ((est.value - cv.value) / cv.value) * 100;
  const rounded = Math.round(pct);
  const label = `${rounded > 0 ? "+" : ""}${rounded}%`;
  const abs = Math.abs(rounded);
  if (rounded <= -8) return { pct: rounded, label, tone: "danger" };
  if (rounded >= 8) return { pct: rounded, label, tone: "success" };
  if (abs <= 3) return { pct: rounded, label, tone: "neutral" };
  return { pct: rounded, label, tone: "warning" };
}

function fact<T>(f: Provenance<T> | undefined): T | null {
  return f?.value ?? null;
}

export function PropertyHero({ property }: PropertyHeroProps) {
  const delta = priceDelta(property.cv, property.estimate);
  const land = fact(property.land_area);
  const floor = fact(property.floor_area);
  const beds = fact(property.bedrooms);
  const built = fact(property.year_built);
  const lastSold = fact(property.last_sold_date);
  const lastSoldPrice = fact(property.last_sold_price);

  const specParts: string[] = [];
  if (land) specParts.push(`${land.toLocaleString("en-NZ")} m² land`);
  if (floor) specParts.push(`${floor.toLocaleString("en-NZ")} m² floor`);
  if (beds) specParts.push(`${beds} bed`);
  if (built) specParts.push(`built ${built}`);
  if (lastSold) {
    const price = lastSoldPrice
      ? ` (${formatMoneyNZ(lastSoldPrice)})`
      : "";
    specParts.push(`sold ${formatDateNZ(lastSold)}${price}`);
  }

  return (
    <section className="neu-raised p-6 flex flex-col gap-4">
      {/* Hero band. Mobile stacks vertically so the money values never clip;
          from sm: it's CV | delta | Estimate side by side. */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] items-center gap-4">
        <HeroValue
          label="Capital value"
          value={formatMoneyNZCompact(property.cv?.value)}
          fullValue={formatMoneyNZ(property.cv?.value)}
          source={property.cv?.source}
          align="left"
        />

        <div className="flex sm:flex-col items-center justify-center gap-1">
          <span
            aria-hidden
            className="t-caption text-text-subtle uppercase tracking-wide"
          >
            Δ
          </span>
          {delta ? (
            <span
              className={cn(
                "chip tabular",
                delta.tone === "success" && "chip-success",
                delta.tone === "warning" && "chip-warning",
                delta.tone === "danger" && "chip-danger",
                delta.tone === "neutral" && "chip-neutral"
              )}
              aria-label={`Estimate is ${delta.label} versus capital value`}
            >
              {delta.label}
            </span>
          ) : (
            <span className="chip chip-neutral">—</span>
          )}
        </div>

        <HeroValue
          label="Estimate"
          value={formatMoneyNZCompact(property.estimate?.value)}
          fullValue={formatMoneyNZ(property.estimate?.value)}
          source={property.estimate?.source}
          align="left-sm-right"
        />
      </div>

      {/* Compact spec line */}
      {specParts.length > 0 ? (
        <p className="t-body text-text-muted">
          {specParts.map((p, i) => (
            <span key={p}>
              {i > 0 ? (
                <span aria-hidden className="text-text-subtle mx-2">
                  ·
                </span>
              ) : null}
              <span>{p}</span>
            </span>
          ))}
        </p>
      ) : null}
    </section>
  );
}

interface HeroValueProps {
  label: string;
  /** Compact form shown at hero size, e.g. "$2.15M". */
  value: string;
  /** Full form shown as a tooltip and screen-reader announcement. */
  fullValue?: string;
  source?: string;
  align: "left" | "right" | "left-sm-right";
}

function HeroValue({
  label,
  value,
  fullValue,
  source,
  align,
}: HeroValueProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 min-w-0",
        align === "right" && "items-end text-right",
        align === "left" && "items-start text-left",
        align === "left-sm-right" &&
          "items-start text-left sm:items-end sm:text-right"
      )}
    >
      <span className="t-caption text-text-subtle uppercase tracking-wide">
        {label}
      </span>
      <span
        className="t-display tabular leading-none"
        title={fullValue ?? value}
        aria-label={fullValue ?? value}
      >
        {value}
      </span>
      {source ? (
        <span className="t-caption text-text-muted">from {source}</span>
      ) : null}
    </div>
  );
}
