import type { Comparable } from "@/lib/mock";
import { formatDateNZ, formatMoneyNZ } from "@/lib/utils";

interface ComparisonStripProps {
  comps: Comparable[];
}

function deltaChip(sale: number, cv: number) {
  const delta = ((sale - cv) / cv) * 100;
  const rounded = Math.round(delta);
  if (rounded > 3) {
    return <span className="chip chip-success tabular">+{rounded}%</span>;
  }
  if (rounded < -3) {
    return <span className="chip chip-danger tabular">{rounded}%</span>;
  }
  return (
    <span className="chip chip-neutral tabular">
      {rounded > 0 ? "+" : ""}
      {rounded}%
    </span>
  );
}

export function ComparisonStrip({ comps }: ComparisonStripProps) {
  return (
    <div className="surface-flat overflow-hidden">
      <div className="px-4 py-2 t-caption text-text-subtle uppercase tracking-wide border-b">
        Nearby sales (last 6 months)
      </div>
      <div className="overflow-x-auto">
        <table className="w-full t-body">
          <thead>
            <tr className="text-text-muted">
              <th className="text-left px-4 py-2 font-medium">Address</th>
              <th className="text-right px-4 py-2 font-medium">Sale price</th>
              <th className="text-right px-4 py-2 font-medium">vs CV</th>
              <th className="text-right px-4 py-2 font-medium">Sold</th>
              <th className="text-left  px-4 py-2 font-medium">Agent</th>
            </tr>
          </thead>
          <tbody>
            {comps.map((c, i) => (
              <tr
                key={c.address}
                className={i % 2 === 1 ? "bg-surface-elevated" : ""}
              >
                <td className="px-4 py-2">{c.address}</td>
                <td className="px-4 py-2 text-right tabular">
                  {formatMoneyNZ(c.sale_price)}
                </td>
                <td className="px-4 py-2 text-right">
                  {deltaChip(c.sale_price, c.cv_at_sale)}
                </td>
                <td className="px-4 py-2 text-right tabular">
                  {formatDateNZ(c.sale_date)}
                </td>
                <td className="px-4 py-2 text-text-muted">
                  {c.agent_name}
                  <span className="text-text-subtle"> · {c.agency}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
