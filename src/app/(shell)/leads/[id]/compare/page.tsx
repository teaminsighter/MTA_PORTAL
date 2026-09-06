export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getLead } from "@/lib/repo/leads";
import { getPropertyForLead } from "@/lib/repo/properties";
import { listComparablesForLead } from "@/lib/repo/comparables";
import { formatDateNZ, formatMoneyNZ } from "@/lib/utils";

interface Props {
  params: Promise<{ id: string }>;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

/** Percentage width, clamped to [10, 100], for a rough bar indicator. */
function pctBar(value: number, max: number): number {
  if (max <= 0) return 10;
  return Math.max(10, Math.min(100, Math.round((value / max) * 100)));
}

export default async function ComparePage({ params }: Props) {
  const { id } = await params;
  const [lead, property, comps] = await Promise.all([
    getLead(id),
    getPropertyForLead(id),
    listComparablesForLead(id),
  ]);
  if (!lead) notFound();

  const salePrices = comps.map((c) => c.sale_price);
  const cvAtSales = comps.map((c) => c.cv_at_sale);
  const medianSale = median(salePrices);
  const medianCv = median(cvAtSales);

  const subjectCv = property?.cv?.value ?? 0;
  const subjectEstimate = property?.estimate?.value ?? 0;
  const subjectLand = property?.land_area?.value ?? 0;
  const subjectFloor = property?.floor_area?.value ?? 0;

  const maxCv = Math.max(subjectCv, medianCv);
  const maxSale = Math.max(subjectEstimate, medianSale);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Link
            href={`/leads/${lead.id}`}
            className="t-caption text-text-muted flex items-center gap-1 hover:text-accent"
          >
            <ArrowLeft size={12} /> Back to workspace
          </Link>
          <h1 className="t-display leading-tight">Compare</h1>
          <p className="t-body text-text-muted">{lead.address}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Subject */}
        <section className="surface-flat p-5 flex flex-col gap-4">
          <div>
            <div className="t-caption text-text-subtle uppercase tracking-wide">
              Subject property
            </div>
            <h2 className="t-section">{lead.address}</h2>
          </div>

          <dl className="grid grid-cols-2 gap-3 t-body">
            <div>
              <dt className="t-caption text-text-muted">CV</dt>
              <dd className="t-section tabular">
                {formatMoneyNZ(subjectCv)}
              </dd>
              <div
                className="h-1.5 rounded-neu-pill mt-1"
                style={{
                  width: `${pctBar(subjectCv, maxCv)}%`,
                  background: "var(--accent-gradient)",
                }}
              />
            </div>
            <div>
              <dt className="t-caption text-text-muted">Estimate</dt>
              <dd className="t-section tabular">
                {formatMoneyNZ(subjectEstimate)}
              </dd>
              <div
                className="h-1.5 rounded-neu-pill mt-1"
                style={{
                  width: `${pctBar(subjectEstimate, maxSale)}%`,
                  background: "var(--accent-gradient)",
                }}
              />
            </div>
            <div>
              <dt className="t-caption text-text-muted">Land</dt>
              <dd className="t-body tabular">{subjectLand} sqm</dd>
            </div>
            <div>
              <dt className="t-caption text-text-muted">Floor</dt>
              <dd className="t-body tabular">{subjectFloor} sqm</dd>
            </div>
            <div>
              <dt className="t-caption text-text-muted">Price / sqm</dt>
              <dd className="t-body tabular">
                {subjectFloor > 0
                  ? formatMoneyNZ(Math.round(subjectEstimate / subjectFloor))
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="t-caption text-text-muted">Last sold</dt>
              <dd className="t-body tabular">
                {property?.last_sold_date
                  ? formatDateNZ(property.last_sold_date.value)
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>

        {/* Comparables summary */}
        <section className="surface-flat p-5 flex flex-col gap-4">
          <div>
            <div className="t-caption text-text-subtle uppercase tracking-wide">
              Comparable set (median)
            </div>
            <h2 className="t-section tabular">{comps.length} nearby sales</h2>
          </div>

          <dl className="grid grid-cols-2 gap-3 t-body">
            <div>
              <dt className="t-caption text-text-muted">Median CV</dt>
              <dd className="t-section tabular">{formatMoneyNZ(medianCv)}</dd>
              <div
                className="h-1.5 rounded-neu-pill mt-1"
                style={{
                  width: `${pctBar(medianCv, maxCv)}%`,
                  background: "var(--accent-gradient)",
                }}
              />
            </div>
            <div>
              <dt className="t-caption text-text-muted">Median sale</dt>
              <dd className="t-section tabular">
                {formatMoneyNZ(medianSale)}
              </dd>
              <div
                className="h-1.5 rounded-neu-pill mt-1"
                style={{
                  width: `${pctBar(medianSale, maxSale)}%`,
                  background: "var(--accent-gradient)",
                }}
              />
            </div>
            <div>
              <dt className="t-caption text-text-muted">Sales in 12 months</dt>
              <dd className="t-body tabular">{comps.length}</dd>
            </div>
            <div>
              <dt className="t-caption text-text-muted">Sale vs CV</dt>
              <dd className="t-body tabular">
                {medianCv > 0
                  ? `${Math.round(((medianSale - medianCv) / medianCv) * 100)}%`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="t-caption text-text-muted">Median $/sqm (est.)</dt>
              <dd className="t-body tabular">
                {subjectFloor > 0
                  ? formatMoneyNZ(Math.round(medianSale / subjectFloor))
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="t-caption text-text-muted">Latest sale</dt>
              <dd className="t-body tabular">
                {comps.length > 0
                  ? formatDateNZ(
                      comps
                        .map((c) => c.sale_date)
                        .sort()
                        .reverse()[0]
                    )
                  : "—"}
              </dd>
            </div>
          </dl>
        </section>
      </div>

      {/* Comps table (desktop) */}
      <section className="surface-flat overflow-hidden hidden md:block">
        <div className="px-4 py-2 t-caption text-text-subtle uppercase tracking-wide border-b">
          All comparables
        </div>
        <table className="w-full t-body">
          <thead className="bg-surface-elevated">
            <tr className="text-text-muted">
              <th className="text-left px-4 py-2 font-medium">Address</th>
              <th className="text-right px-4 py-2 font-medium">Sale price</th>
              <th className="text-right px-4 py-2 font-medium">CV at sale</th>
              <th className="text-right px-4 py-2 font-medium">Sold</th>
              <th className="text-right px-4 py-2 font-medium">Distance</th>
            </tr>
          </thead>
          <tbody>
            {comps.map((c, i) => (
              <tr key={c.address} className={i % 2 === 1 ? "bg-surface-elevated" : ""}>
                <td className="px-4 py-2">{c.address}</td>
                <td className="px-4 py-2 text-right tabular">
                  {formatMoneyNZ(c.sale_price)}
                </td>
                <td className="px-4 py-2 text-right tabular">
                  {formatMoneyNZ(c.cv_at_sale)}
                </td>
                <td className="px-4 py-2 text-right tabular">
                  {formatDateNZ(c.sale_date)}
                </td>
                <td className="px-4 py-2 text-right tabular">{c.distance_m} m</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Mobile bottom "Back to workspace" */}
      <div className="md:hidden fixed bottom-4 left-4 right-4 z-20">
        <Link
          href={`/leads/${lead.id}`}
          className="neu-raised w-full py-3 flex items-center justify-center gap-2 t-body font-semibold"
        >
          <ArrowLeft size={14} /> Back to workspace
        </Link>
      </div>
      <div className="md:hidden h-16" />
    </div>
  );
}
