"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BarChart3, Send, UserPlus } from "lucide-react";
import { pickAgentAction, unpickAgentAction } from "@/app/actions/picks";
import type {
  ActivityEvent,
  AgentCandidate,
  Comparable,
  Lead,
} from "@/lib/mock";
import type { ShortlistEntry } from "@/lib/repo/agents";
import type { PropertyBundle } from "@/lib/repo/properties";
import { AgentRow } from "@/components/lead/AgentRow";
import { CandidateRow } from "@/components/lead/CandidateRow";
import { CompactTimeline } from "@/components/lead/CompactTimeline";
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
  property: PropertyBundle | null;
  comps: Comparable[];
  shortlist: ShortlistEntry[];
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
  const [tab, setTab] = useState<MobileTab>("property");
  const [railCollapsed, setRailCollapsed] = useState(false);
  const router = useRouter();

  /*
   * Picks are now server-of-record on lead_agent_picks. The UI reads
   * them off the ShortlistEntry.pick payload; useOptimistic bridges
   * the click → server response gap so the tick and picked-to-top
   * reorder land instantly. router.refresh() reconciles with the DB
   * state after the action completes.
   */
  type PickAction =
    | { kind: "pick"; agentId: string }
    | { kind: "unpick"; agentId: string };

  const [optimisticShortlist, applyPickOptimistic] = useOptimistic(
    shortlist,
    (state, action: PickAction) => {
      return state.map((entry) => {
        if (entry.agent.id !== action.agentId) return entry;
        if (action.kind === "pick") {
          return {
            ...entry,
            pick: entry.pick ?? {
              reasonNote: "",
              // Ephemeral version 0; the real one comes back from the
              // server action and lands via router.refresh().
              version: 0,
              displayOrder: Number.MAX_SAFE_INTEGER,
            },
          };
        }
        return { ...entry, pick: null };
      });
    }
  );
  const [pickPending, startPickTransition] = useTransition();

  const isEmpty = lead.state === "empty_workspace";

  const recipientCount = useMemo(
    () => optimisticShortlist.filter((e) => e.pick !== null).length,
    [optimisticShortlist]
  );

  /*
   * Picked-to-top ordering. Within picks, sort ascending by
   * display_order so agents render in the sequence Sarah ticked them
   * (matches lead_agent_picks.display_order and the eventual vendor
   * email order). Unpicked agents keep the shortlist's default
   * ordering (nearby_sales desc).
   */
  const orderedShortlist = useMemo(() => {
    return [...optimisticShortlist].sort((a, b) => {
      const aPicked = a.pick !== null;
      const bPicked = b.pick !== null;
      if (aPicked && !bPicked) return -1;
      if (!aPicked && bPicked) return 1;
      if (aPicked && bPicked) {
        return (a.pick?.displayOrder ?? 0) - (b.pick?.displayOrder ?? 0);
      }
      return 0;
    });
  }, [optimisticShortlist]);

  function toggle(agentId: string) {
    const entry = optimisticShortlist.find((e) => e.agent.id === agentId);
    if (!entry) return;
    const currentlyPicked = entry.pick !== null;

    startPickTransition(async () => {
      applyPickOptimistic({
        kind: currentlyPicked ? "unpick" : "pick",
        agentId,
      });

      const res = currentlyPicked
        ? await unpickAgentAction({
            lead_public_id: lead.id,
            agent_id: agentId,
            expected_version: entry.pick?.version ?? 1,
          })
        : await pickAgentAction({
            lead_public_id: lead.id,
            agent_id: agentId,
          });

      if (!res.ok && res.code === "version_conflict") {
        // Someone else changed the pick between our read and click.
        // Refresh drops the optimistic state and pulls the truth.
        router.refresh();
        return;
      }
      // Success or non-conflict error → refresh either way so the
      // authoritative version + display_order come from the server.
      router.refresh();
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
            <PropertyHero
              leadPublicId={lead.id}
              property={property?.facts ?? {}}
              initialVersion={property?.version ?? 0}
            />
            <PropertyTabs comps={comps} history={activity} />
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
                <span className="text-text font-semibold">
                  {recipientCount}
                </span>{" "}
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
                {orderedShortlist.map((entry) => (
                  <AgentRow
                    key={entry.agent.id}
                    leadPublicId={lead.id}
                    agent={entry.agent}
                    pick={entry.pick}
                    picked={entry.pick !== null}
                    togglePending={pickPending}
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
                      <CandidateRow leadPublicId={lead.id} candidate={c} />
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
