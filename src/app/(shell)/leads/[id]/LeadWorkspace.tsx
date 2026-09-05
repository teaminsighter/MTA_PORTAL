"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart3, Send, UserPlus } from "lucide-react";
import type {
  ActivityEvent,
  Agent,
  AgentCandidate,
  Comparable,
  Lead,
  PropertyFacts,
} from "@/lib/mock";
import { AgentCard } from "@/components/lead/AgentCard";
import { ComparisonStrip } from "@/components/lead/ComparisonStrip";
import { PropertyBlock } from "@/components/lead/PropertyBlock";
import { StateChip } from "@/components/lead/StateChip";
import { Timeline } from "@/components/lead/Timeline";
import { VendorBlock } from "@/components/lead/VendorBlock";
import { SendBar } from "@/components/shell/SendBar";
import { BottomActionBar } from "@/components/shell/BottomActionBar";
import { EmptyState } from "@/components/states/EmptyState";
import { cn } from "@/lib/utils";

interface Props {
  lead: Lead;
  property: PropertyFacts | null;
  comps: Comparable[];
  shortlist: Agent[];
  candidates: AgentCandidate[];
  activity: ActivityEvent[];
}

type MobileTab = "property" | "agents" | "vendor";

export default function LeadWorkspace({
  lead,
  property,
  comps,
  shortlist,
  candidates,
  activity,
}: Props) {
  const [picks, setPicks] = useState<Set<string>>(
    new Set(shortlist.slice(0, 3).map((a) => a.id))
  );
  const [tab, setTab] = useState<MobileTab>("property");
  const [showCandidates, setShowCandidates] = useState(false);

  const isEmpty = lead.state === "empty_workspace";
  const recipientCount = useMemo(() => picks.size, [picks]);

  function toggle(id: string) {
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header (shared) */}
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="t-caption text-text-muted">{lead.id}</div>
          <h1 className="t-display leading-tight">{lead.address}</h1>
        </div>
        <div className="flex items-center gap-2">
          <StateChip state={lead.state} />
          <Link
            href={`/leads/${lead.id}/compare`}
            className="neu-raised-sm px-3 py-2 t-body flex items-center gap-2"
          >
            <BarChart3 size={14} />
            Compare
          </Link>
        </div>
      </header>

      {/* Mobile tabs */}
      <div className="md:hidden flex gap-2 neu-raised p-1">
        {(["property", "agents", "vendor"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "flex-1 py-2 t-body rounded-neu-sm capitalize",
              tab === k ? "neu-inset-sm text-text" : "text-text-muted"
            )}
          >
            {k}
          </button>
        ))}
      </div>

      {isEmpty ? (
        <EmptyState
          title="No data yet"
          body="This lead has just landed. Enrichment will populate the property and shortlist within 30 seconds, or paste in manually if a source is down."
          action={
            <button type="button" className="neu-raised-sm px-4 py-2 t-body">
              Enter property manually
            </button>
          }
          className="md:w-2/3 md:mx-auto"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {/* LEFT: property */}
          <section
            className={cn(
              "md:col-span-4 flex flex-col gap-4",
              tab === "property" ? "block" : "hidden md:flex"
            )}
          >
            {property ? (
              <PropertyBlock address={lead.address} property={property} />
            ) : (
              <EmptyState
                title="Property enriching…"
                body="Cotality is fetching CV, land, floor and last-sold data. Fill in manually if you can't wait."
              />
            )}
            {comps.length > 0 ? <ComparisonStrip comps={comps} /> : null}
          </section>

          {/* CENTRE: agents */}
          <section
            className={cn(
              "md:col-span-5 flex flex-col gap-4",
              tab === "agents" ? "block" : "hidden md:flex"
            )}
          >
            <div className="flex items-baseline justify-between">
              <h2 className="t-section">Shortlist</h2>
              <span className="t-caption text-text-muted tabular">
                {picks.size} picked · {shortlist.length} suggested
              </span>
            </div>

            {shortlist.length === 0 ? (
              <EmptyState
                title="No agents yet"
                body="Add signed agents to your MTA database to see shortlist suggestions here."
              />
            ) : (
              <div className="flex flex-col gap-3">
                {shortlist.map((a) => (
                  <AgentCard
                    key={a.id}
                    agent={a}
                    picked={picks.has(a.id)}
                    onToggle={toggle}
                  />
                ))}
              </div>
            )}

            <div className="flex items-center justify-between mt-2">
              <h3 className="t-body font-semibold flex items-center gap-2">
                <UserPlus size={14} className="text-text-muted" />
                Candidates from nearby sales
                <span className="chip chip-neutral tabular">
                  {candidates.length}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setShowCandidates((v) => !v)}
                className="t-caption text-text-muted underline underline-offset-2"
              >
                {showCandidates ? "Hide" : "Show"}
              </button>
            </div>
            {showCandidates && candidates.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {candidates.map((c) => (
                  <li
                    key={c.id}
                    className="neu-raised-sm p-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="t-body font-medium truncate">
                        {c.name}
                      </div>
                      <div className="t-caption text-text-muted truncate">
                        {c.agency} · {c.reason_hint}
                      </div>
                    </div>
                    <span
                      className={cn(
                        "chip",
                        c.confidence === "high"
                          ? "chip-success"
                          : c.confidence === "medium"
                          ? "chip-warning"
                          : "chip-neutral"
                      )}
                    >
                      {c.confidence}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {/* RIGHT: vendor + timeline */}
          <section
            className={cn(
              "md:col-span-3 flex flex-col gap-4",
              tab === "vendor" ? "block" : "hidden md:flex"
            )}
          >
            <VendorBlock lead={lead} />
            {activity.length > 0 ? (
              <Timeline events={activity} />
            ) : (
              <EmptyState title="No activity yet" body="Sends, deliveries and AC syncs will appear here." />
            )}
          </section>
        </div>
      )}

      {/* Desktop send bar */}
      {!isEmpty ? <SendBar recipientCount={recipientCount} /> : null}

      {/* Mobile bottom send action */}
      {!isEmpty ? (
        <BottomActionBar>
          <div className="flex-1 t-body">
            <div className="t-caption text-text-muted">Recipients</div>
            <div className="font-semibold tabular">
              {recipientCount} agent{recipientCount === 1 ? "" : "s"}
            </div>
          </div>
          <button
            type="button"
            className="btn-accent-glass"
            disabled={recipientCount === 0}
          >
            <Send size={16} />
            Send
          </button>
        </BottomActionBar>
      ) : null}

      {/* Reserve space on mobile so bottom bar doesn't cover last row */}
      <div className="md:hidden h-24" />
    </div>
  );
}
