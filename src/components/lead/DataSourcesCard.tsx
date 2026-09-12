import type { PropertyFacts } from "@/lib/mock";
import { cn, formatRelative } from "@/lib/utils";

/*
 * Cross-source enrichment coverage.
 *
 * Groups the property facts by the provider that fetched them
 * (cotality / homes / corelogic / linz / manual) and reports:
 *   - fetched: how many of the 10 tracked fields that source filled
 *   - matched: how many of those agreed with cross-source triangulation
 *     (demo confidences until real diffing lands in Phase 2)
 *   - coverage: fetched / total_present as a share bar
 *
 * Used both in the inbox preview and inside the /leads Analysis tab.
 */

/*
 * Per-provider label + confidence. Cotality is our canonical valuation
 * authority; homes.co.nz agrees ~92% on sold prices / estimates;
 * corelogic occasionally disagrees on physical facts; LINZ is
 * authoritative for cadastral land area.
 */
export const SOURCE_META: Record<
  string,
  { label: string; confidence: number; hue: string }
> = {
  cotality: { label: "Cotality", confidence: 1.0, hue: "#FF7A00" },
  homes: { label: "Homes.co.nz", confidence: 0.92, hue: "#FF3D71" },
  corelogic: { label: "CoreLogic", confidence: 0.88, hue: "#3366FF" },
  linz: { label: "LINZ", confidence: 1.0, hue: "#00B383" },
  manual: { label: "Manual override", confidence: 1.0, hue: "#8B5CF6" },
};

interface Props {
  property: PropertyFacts;
}

export function DataSourcesCard({ property }: Props) {
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

  const bySource = new Map<string, { fetched: number; latest: string }>();
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
              <span className="tabular">fetched {formatRelative(r.latest)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
