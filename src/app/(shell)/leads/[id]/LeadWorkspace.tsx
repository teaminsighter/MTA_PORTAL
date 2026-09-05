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
import { AgentRow } from "@/components/lead/AgentRow";
import { CandidateRow } from "@/components/lead/CandidateRow";
import { CompactTimeline } from "@/components/lead/CompactTimeline";
import { LeadHeaderStepper } from "@/components/lead/LeadHeaderStepper";
import { PropertyHero } from "@/components/lead/PropertyHero";
import { PropertyTabs } from "@/components/lead/PropertyTabs";
import { RightRail } from "@/components/lead/RightRail";
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
  const [railCollapsed, setRailCollapsed] = useState(false);

  const isEmpty = lead.state === "empty_workspace";
  const recipientCount = useMemo(() => picks.size, [picks]);

  // Picked agents float to the top so the send preview matches reading order.
  const orderedShortlist = useMemo(() => {
    return [...shortlist].sort((a, b) => {
      const aPicked = picks.has(a.id) ? 0 : 1;
      const bPicked = picks.has(b.id) ? 0 : 1;
      return aPicked - bPicked;
    });
  }, [shortlist, picks]);

  function toggle(id: string) {
    setPicks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    // 40px between major sections (space-y-10). 24px gutters via gap-6.
    <div className="flex flex-col gap-10">
      {/* -------- Header -------- */}
      <header className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="t-caption text-text-muted">{lead.id}</div>
            <h1 className="t-display leading-tight">{lead.address}</h1>
          </div>
          <Link
            href={`/leads/${lead.id}/compare`}
            className="neu-raised-sm px-3 py-2 t-body flex items-center gap-2 shrink-0"
          >
            <BarChart3 size={14} />
            Compare
          </Link>
        </div>

        <LeadHeaderStepper state={lead.state} />
      </header>

      {/* -------- Mobile tabs (hidden on desktop) -------- */}
      <div className="md:hidden neu-raised p-1 flex gap-1 -mt-4">
        {(["property", "agents", "vendor"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={cn(
              "flex-1 py-2 t-body rounded-neu-sm capitalize",
              tab === k ? "neu-inset-sm text-text font-semibold" : "text-text-muted"
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
        // 12-col grid: 4/5/3, 24px gutter. When the right rail collapses it
        // becomes narrow and centre + property absorb the width.
        <div
          className={cn(
            "grid grid-cols-1 md:grid-cols-12 gap-6",
            railCollapsed && "md:[&>[data-col=right]]:col-span-1 md:[&>[data-col=centre]]:col-span-6 md:[&>[data-col=left]]:col-span-5"
          )}
        >
          {/* ---------- LEFT: property ---------- */}
          <section
            data-col="left"
            className={cn(
              "md:col-span-4 flex flex-col gap-6",
              tab === "property" ? "block" : "hidden md:flex"
            )}
          >
            {property ? (
              <>
                <PropertyHero property={property} />
                <PropertyTabs comps={comps} history={activity} />
              </>
            ) : (
              <EmptyState
                title="Property enriching…"
                body="Cotality is fetching CV, land, floor and last-sold data. Fill in manually if you can't wait."
              />
            )}
          </section>

          {/* ---------- CENTRE: shortlist ---------- */}
          <section
            data-col="centre"
            className={cn(
              "md:col-span-5 flex flex-col gap-4",
              tab === "agents" ? "block" : "hidden md:flex"
            )}
          >
            <div className="flex items-baseline justify-between">
              <h2 className="t-section">Shortlist</h2>
              <span className="t-caption text-text-muted tabular">
                <span className="text-text font-semibold">{picks.size}</span>{" "}
                picked · {shortlist.length} suggested
              </span>
            </div>

            {shortlist.length === 0 ? (
              <EmptyState
                title="No agents yet"
                body="Add signed agents to your MTA database to see shortlist suggestions here."
              />
            ) : (
              <div className="flex flex-col gap-2 anim-stagger">
                {orderedShortlist.map((a) => (
                  <AgentRow
                    key={a.id}
                    agent={a}
                    picked={picks.has(a.id)}
                    onToggle={toggle}
                  />
                ))}
              </div>
            )}

            {/* Candidates from nearby sales — visually distinct */}
            {candidates.length > 0 ? (
              <div className="flex flex-col gap-2 mt-2">
                <h3 className="t-body font-semibold flex items-center gap-2 text-text-muted">
                  <UserPlus size={14} />
                  Candidates from nearby sales
                  <span className="chip chip-neutral tabular">
                    {candidates.length}
                  </span>
                </h3>
                <ul className="flex flex-col gap-2 anim-stagger">
                  {candidates.map((c) => (
                    <li key={c.id}>
                      <CandidateRow candidate={c} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>

          {/* ---------- RIGHT: vendor + timeline (collapsible) ---------- */}
          <section
            data-col="right"
            className={cn(
              "md:col-span-3",
              tab === "vendor" ? "block" : "hidden md:block"
            )}
          >
            <RightRail onCollapsedChange={setRailCollapsed}>
              <VendorBlock lead={lead} />
              {activity.length > 0 ? (
                <CompactTimeline events={activity} />
              ) : (
                <EmptyState
                  title="No activity yet"
                  body="Sends, deliveries and AC syncs will appear here."
                />
              )}
            </RightRail>
          </section>
        </div>
      )}

      {/* Desktop slide-in send bar */}
      {!isEmpty ? <SendBar recipientCount={recipientCount} /> : null}

      {/* Mobile pinned bottom action */}
      {!isEmpty ? (
        <BottomActionBar>
          <div className="flex-1 t-body">
            <div className="t-caption text-text-muted">Recipients</div>
            <div className="font-semibold flex items-baseline gap-1">
              <span
                key={recipientCount}
                className="inline-block anim-count-roll tabular"
              >
                {recipientCount}
              </span>
              <span>agent{recipientCount === 1 ? "" : "s"}</span>
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

      {/* Reserve room on mobile so the pinned bar never covers the last card */}
      <div className="md:hidden h-24" />
    </div>
  );
}
