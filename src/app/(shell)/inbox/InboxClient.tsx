"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Filter, Inbox as InboxIcon } from "lucide-react";
import { leads } from "@/lib/mock";
import { LeadCard } from "@/components/lead/LeadCard";
import { StateChip } from "@/components/lead/StateChip";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingSkeleton } from "@/components/states/LoadingSkeleton";
import { cn, formatRelative } from "@/lib/utils";

type FilterKey = "all" | "new" | "in_progress" | "sent" | "needs_attention";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "in_progress", label: "In progress" },
  { key: "sent", label: "Sent" },
  { key: "needs_attention", label: "Needs attention" },
];

function matchesFilter(state: string, f: FilterKey): boolean {
  if (f === "all") return true;
  if (f === "new") return state === "received" || state === "empty_workspace";
  if (f === "in_progress")
    return (
      state === "enriching" ||
      state === "ready_for_review" ||
      state === "dispatching" ||
      state === "awaiting_agent_responses"
    );
  if (f === "sent")
    return (
      state === "sent" ||
      state === "agent_appointed" ||
      state === "listed" ||
      state === "sold"
    );
  if (f === "needs_attention") return state === "partial_send";
  return true;
}

export default function InboxClient() {
  const search = useSearchParams();
  const demoState = search.get("state"); // "empty" | "error" | "loading" | null
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string>(leads[0]?.id ?? "");

  const filtered = useMemo(
    () => leads.filter((l) => matchesFilter(l.state, activeFilter)),
    [activeFilter]
  );

  const selected = filtered.find((l) => l.id === selectedId) ?? filtered[0];

  return (
    <div className="flex flex-col md:flex-row gap-4">
      {/* Left rail — list */}
      <section className="md:w-[420px] w-full flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="t-display">Inbox</h1>
          <button
            type="button"
            aria-label="Filter"
            className="md:hidden neu-raised-sm h-9 w-9 flex items-center justify-center text-text-muted"
          >
            <Filter size={16} />
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveFilter(f.key)}
              className={cn(
                "chip",
                activeFilter === f.key ? "chip-info" : "chip-neutral"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {demoState === "loading" ? (
          <LoadingSkeleton rows={5} />
        ) : demoState === "empty" || filtered.length === 0 ? (
          <EmptyState
            icon={<InboxIcon size={20} />}
            title="Nothing here yet"
            body="New leads will appear here within 90 seconds of submission."
          />
        ) : demoState === "error" ? (
          <ErrorState onRetry={() => window.location.reload()} />
        ) : (
          <ul className="flex flex-col gap-3">
            {filtered.map((lead) => (
              <li key={lead.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(lead.id)}
                  className="w-full text-left md:block"
                  aria-current={selected?.id === lead.id ? "true" : undefined}
                >
                  <div className="hidden md:block">
                    <LeadCard lead={lead} selected={selected?.id === lead.id} />
                  </div>
                  <div className="md:hidden">
                    <LeadCard lead={lead} href={`/leads/${lead.id}`} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Right pane — preview (desktop only) */}
      <section className="hidden md:flex flex-1 min-w-0">
        {selected ? (
          <div className="neu-raised p-6 flex flex-col gap-4 w-full">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="t-section">{selected.address}</h2>
                <p className="t-body text-text-muted">
                  {selected.vendor_name} · {selected.id}
                </p>
              </div>
              <StateChip state={selected.state} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="neu-inset-sm p-3">
                <div className="t-caption text-text-subtle uppercase tracking-wide">
                  Source
                </div>
                <div className="t-body font-medium">
                  {selected.source === "web"
                    ? "Web form"
                    : selected.source === "ac_manual"
                    ? "AC manual"
                    : "AC import"}
                </div>
              </div>
              <div className="neu-inset-sm p-3">
                <div className="t-caption text-text-subtle uppercase tracking-wide">
                  Received
                </div>
                <div className="t-body font-medium tabular">
                  {formatRelative(selected.created_at)}
                </div>
              </div>
            </div>

            <div className="mt-2">
              <Link href={`/leads/${selected.id}`} className="btn-accent-glass">
                Open lead
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        ) : (
          <EmptyState
            className="w-full"
            title="Select a lead"
            body="Pick a lead from the list to see the details here."
          />
        )}
      </section>
    </div>
  );
}
