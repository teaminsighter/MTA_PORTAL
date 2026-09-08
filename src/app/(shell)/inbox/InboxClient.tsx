"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Filter, Inbox as InboxIcon } from "lucide-react";
import type { Lead, LeadState } from "@/lib/mock";
import { LeadCard } from "@/components/lead/LeadCard";
import { StateChip } from "@/components/lead/StateChip";
import { EmptyState } from "@/components/states/EmptyState";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingSkeleton } from "@/components/states/LoadingSkeleton";
import { cn, formatRelative } from "@/lib/utils";
import type { InboxResponse } from "@/app/api/inbox/route";
import {
  countUnread,
  markInboxSeen,
  useInbox,
  useLastSeenAt,
} from "@/lib/inbox/use-inbox";

/*
 * Inbox screen (client). SSR delivers the first payload via
 * initialLeads; TanStack Query then polls /api/inbox every 15s and on
 * window focus. The Sidebar badge subscribes to the same query key
 * (["inbox"]) so it stays in lockstep with the list — no duplicate
 * requests.
 *
 * Filter chips map §9 states into user-facing buckets. Filters run
 * client-side on the polled dataset; the server always returns the
 * top 50 recent regardless.
 *
 * "Unread" is a client-only concept: a lead is unread if its
 * created_at is newer than the localStorage lastSeenAt timestamp.
 * The timestamp is bumped when the inbox mounts (and on subsequent
 * tab-focus events while on this page) so re-visiting from another
 * screen resets the badge.
 */

type FilterKey =
  | "all"
  | "new"
  | "in_progress"
  | "sent"
  | "needs_attention";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "in_progress", label: "In progress" },
  { key: "sent", label: "Sent" },
  { key: "needs_attention", label: "Needs attention" },
];

const NEW_STATES: LeadState[] = ["received", "empty_workspace"];
const IN_PROGRESS_STATES: LeadState[] = [
  "enriching",
  "ready_for_review",
  "dispatching",
  "awaiting_agent_responses",
];
const SENT_STATES: LeadState[] = [
  "sent",
  "agent_appointed",
  "listed",
  "sold",
];
const NEEDS_ATTENTION_STATES: LeadState[] = ["partial_send"];

function matchesFilter(state: LeadState, f: FilterKey): boolean {
  switch (f) {
    case "all":
      return true;
    case "new":
      return NEW_STATES.includes(state);
    case "in_progress":
      return IN_PROGRESS_STATES.includes(state);
    case "sent":
      return SENT_STATES.includes(state);
    case "needs_attention":
      return NEEDS_ATTENTION_STATES.includes(state);
  }
}

interface InboxClientProps {
  initialLeads: Lead[];
}

export default function InboxClient({ initialLeads }: InboxClientProps) {
  const search = useSearchParams();
  const demoState = search.get("state"); // "empty" | "error" | "loading" | null
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [selectedId, setSelectedId] = useState<string>(
    initialLeads[0]?.id ?? ""
  );

  // Prime the shared query cache with the SSR payload so the Sidebar
  // badge has data on first paint. The by_state/total fields don't
  // matter on the first render; the next poll fills them in.
  const initialData: InboxResponse = useMemo(
    () => ({
      leads: initialLeads,
      total: initialLeads.length,
      by_state: {} as InboxResponse["by_state"],
    }),
    [initialLeads]
  );

  const inbox = useInbox(initialData);
  const leads = inbox.data?.leads ?? initialLeads;

  // Mark seen on mount + on any focus while on this page. The Sidebar
  // badge (which reads the same lastSeen) drops to 0 immediately.
  useEffect(() => {
    markInboxSeen();
    const onFocus = () => markInboxSeen();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const lastSeen = useLastSeenAt();

  const filtered = useMemo(
    () => leads.filter((l) => matchesFilter(l.state, activeFilter)),
    [leads, activeFilter]
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
          {FILTERS.map((f) => {
            const count =
              f.key === "all"
                ? leads.length
                : leads.filter((l) => matchesFilter(l.state, f.key)).length;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setActiveFilter(f.key)}
                className={cn(
                  "chip",
                  activeFilter === f.key ? "chip-info" : "chip-neutral"
                )}
              >
                {f.label}{" "}
                <span className="tabular opacity-70">{count}</span>
              </button>
            );
          })}
        </div>

        {demoState === "loading" ? (
          <LoadingSkeleton rows={5} />
        ) : demoState === "empty" || filtered.length === 0 ? (
          <EmptyState
            icon={<InboxIcon size={20} />}
            title="Nothing here yet"
            body="New leads will appear here within 90 seconds of submission."
          />
        ) : demoState === "error" || inbox.isError ? (
          <ErrorState onRetry={() => inbox.refetch()} />
        ) : (
          <ul className="flex flex-col gap-3">
            {filtered.map((lead) => {
              const isUnread = lastSeen ? lead.created_at > lastSeen : false;
              return (
                <li key={lead.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(lead.id)}
                    className="w-full text-left md:block"
                    aria-current={
                      selected?.id === lead.id ? "true" : undefined
                    }
                  >
                    <div className="hidden md:block">
                      <LeadCard
                        lead={lead}
                        selected={selected?.id === lead.id}
                        unread={isUnread}
                      />
                    </div>
                    <div className="md:hidden">
                      <LeadCard
                        lead={lead}
                        href={`/leads/${lead.id}`}
                        unread={isUnread}
                      />
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {inbox.data ? (
          <div className="t-caption text-text-muted tabular pt-1">
            {inbox.data.total} lead{inbox.data.total === 1 ? "" : "s"} total
            {countUnread(leads, lastSeen) > 0 ? (
              <>
                {" · "}
                <span className="text-accent font-semibold">
                  {countUnread(leads, lastSeen)} new
                </span>
              </>
            ) : null}
          </div>
        ) : null}
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
