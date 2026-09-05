import type { ReactNode } from "react";

interface KpiTileProps {
  label: string;
  value: string;
  delta?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
  icon?: ReactNode;
}

const toneToChip: Record<NonNullable<KpiTileProps["tone"]>, string> = {
  neutral: "chip-neutral",
  success: "chip-success",
  warning: "chip-warning",
  danger: "chip-danger",
};

export function KpiTile({ label, value, delta, tone = "neutral", icon }: KpiTileProps) {
  return (
    <div className="neu-raised p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="t-caption text-text-subtle uppercase tracking-wide">
          {label}
        </div>
        {icon ? (
          <div className="neu-raised-sm h-8 w-8 flex items-center justify-center text-text-muted">
            {icon}
          </div>
        ) : null}
      </div>
      <div className="t-display tabular">{value}</div>
      {delta ? (
        <span className={`chip ${toneToChip[tone]} self-start`}>{delta}</span>
      ) : null}
    </div>
  );
}
