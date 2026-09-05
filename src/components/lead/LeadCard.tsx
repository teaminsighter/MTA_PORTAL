import Link from "next/link";
import type { Lead } from "@/lib/mock";
import { StateChip } from "./StateChip";
import { formatRelative } from "@/lib/utils";

interface LeadCardProps {
  lead: Lead;
  selected?: boolean;
  href?: string;
}

export function LeadCard({ lead, selected, href }: LeadCardProps) {
  const inner = (
    <div
      className={
        selected
          ? "neu-inset p-4 flex flex-col gap-2 transition-colors"
          : "neu-raised p-4 flex flex-col gap-2 transition-colors"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="t-body font-semibold truncate">{lead.address}</div>
          <div className="t-caption text-text-muted truncate">
            {lead.vendor_name} · {lead.id}
          </div>
        </div>
        <StateChip state={lead.state} />
      </div>
      <div className="flex items-center justify-between t-caption text-text-subtle">
        <span>{lead.source === "web" ? "Web form" : lead.source === "ac_manual" ? "AC manual" : "AC import"}</span>
        <span className="tabular">{formatRelative(lead.created_at)}</span>
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} aria-current={selected ? "page" : undefined}>
        {inner}
      </Link>
    );
  }
  return inner;
}
