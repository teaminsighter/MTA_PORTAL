import Link from "next/link";
import type { Lead } from "@/lib/mock";
import { StateChip } from "./StateChip";
import { formatRelative } from "@/lib/utils";

interface LeadCardProps {
  lead: Lead;
  selected?: boolean;
  href?: string;
  /** Render the accent-dot unread indicator on this card. */
  unread?: boolean;
}

export function LeadCard({ lead, selected, href, unread }: LeadCardProps) {
  const inner = (
    <div
      className={
        selected
          ? "neu-inset p-4 flex flex-col gap-2 transition-colors relative"
          : "neu-raised p-4 flex flex-col gap-2 transition-colors relative"
      }
    >
      {unread ? (
        <span
          aria-label="Unread"
          className="absolute top-3 left-3 h-2 w-2 rounded-neu-pill"
          style={{ background: "var(--accent-gradient)" }}
        />
      ) : null}
      <div className="flex items-start justify-between gap-3">
        <div className={unread ? "min-w-0 pl-4" : "min-w-0"}>
          <div className="t-body font-semibold truncate">{lead.address}</div>
          <div className="t-caption text-text-muted truncate">
            {lead.vendor_name} · {lead.id}
          </div>
        </div>
        <StateChip state={lead.state} />
      </div>
      <div className="flex items-center justify-between t-caption text-text-subtle">
        <span>
          {lead.source === "web"
            ? "Web form"
            : lead.source === "ac_manual"
              ? "AC manual"
              : "AC import"}
        </span>
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
