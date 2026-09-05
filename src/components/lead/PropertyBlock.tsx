import type { PropertyFacts, Provenance } from "@/lib/mock";
import { formatDateNZ, formatMoneyNZ, formatRelative } from "@/lib/utils";

interface PropertyBlockProps {
  address: string;
  property: PropertyFacts;
}

interface FactTileProps {
  label: string;
  value: string;
  source?: string;
  fetchedAt?: string;
}

function FactTile({ label, value, source, fetchedAt }: FactTileProps) {
  return (
    <div className="neu-raised-sm p-3 flex flex-col gap-1">
      <div className="t-caption text-text-subtle uppercase tracking-wide">
        {label}
      </div>
      <div className="t-section tabular">{value}</div>
      {source ? (
        <div className="t-caption text-text-muted">
          {source}
          {fetchedAt ? ` · ${formatRelative(fetchedAt)}` : ""}
        </div>
      ) : null}
    </div>
  );
}

function money(f?: Provenance<number>): string {
  return f ? formatMoneyNZ(f.value) : "—";
}

function num(f?: Provenance<number>, suffix?: string): string {
  if (!f) return "—";
  return `${f.value.toLocaleString("en-NZ")}${suffix ? ` ${suffix}` : ""}`;
}

export function PropertyBlock({ address, property }: PropertyBlockProps) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="t-section">{address}</h2>
        <p className="t-caption text-text-muted">Property snapshot</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <FactTile
          label="Capital value"
          value={money(property.cv)}
          source={property.cv?.source}
          fetchedAt={property.cv?.fetched_at}
        />
        <FactTile
          label="Estimate"
          value={money(property.estimate)}
          source={property.estimate?.source}
          fetchedAt={property.estimate?.fetched_at}
        />
        <FactTile
          label="Land"
          value={num(property.land_area, "sqm")}
          source={property.land_area?.source}
          fetchedAt={property.land_area?.fetched_at}
        />
        <FactTile
          label="Floor"
          value={num(property.floor_area, "sqm")}
          source={property.floor_area?.source}
          fetchedAt={property.floor_area?.fetched_at}
        />
        <FactTile
          label="Bedrooms"
          value={property.bedrooms ? String(property.bedrooms.value) : "—"}
          source={property.bedrooms?.source}
          fetchedAt={property.bedrooms?.fetched_at}
        />
        <FactTile
          label="Year built"
          value={property.year_built ? String(property.year_built.value) : "—"}
          source={property.year_built?.source}
          fetchedAt={property.year_built?.fetched_at}
        />
        <FactTile
          label="Last sold"
          value={
            property.last_sold_date
              ? formatDateNZ(property.last_sold_date.value)
              : "—"
          }
          source={property.last_sold_date?.source}
          fetchedAt={property.last_sold_date?.fetched_at}
        />
        <FactTile
          label="Last sold price"
          value={money(property.last_sold_price)}
          source={property.last_sold_price?.source}
          fetchedAt={property.last_sold_price?.fetched_at}
        />
      </div>
    </section>
  );
}
