"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Check,
  Mail,
  MessageSquare,
  Phone as PhoneIcon,
  Send,
  User,
  UserPlus,
} from "lucide-react";
import { pickAgentAction, unpickAgentAction } from "@/app/actions/picks";
import type {
  ActivityEvent,
  Agent,
  AgentCandidate,
  Comparable,
  Lead,
} from "@/lib/mock";
import type { ShortlistEntry } from "@/lib/repo/agents";
import type { PropertyBundle } from "@/lib/repo/properties";
import { AgentRow } from "@/components/lead/AgentRow";
import { CallPanel } from "@/components/lead/CallPanel";
import { CandidateRow } from "@/components/lead/CandidateRow";
import { PropertyHero } from "@/components/lead/PropertyHero";
import { PropertyTabs } from "@/components/lead/PropertyTabs";
import { TemplatePackModal } from "@/components/lead/TemplatePackModal";
import { SendBar } from "@/components/shell/SendBar";
import { BottomActionBar } from "@/components/shell/BottomActionBar";
import { EmptyState } from "@/components/states/EmptyState";
import {
  countAwaiting,
  countConfirmed,
  derivePhase,
  type AgentRowStatus,
} from "@/lib/lead/send-flow";
import { agentRating } from "@/lib/lead/agent-rating";
import { cn } from "@/lib/utils";

interface Props {
  lead: Lead;
  property: PropertyBundle | null;
  comps: Comparable[];
  shortlist: ShortlistEntry[];
  candidates: AgentCandidate[];
  activity: ActivityEvent[];
  /** Next lead in inbox order — powers the "continue" jump after
      the vendor packet is sent. Wraps to the top if we're at the end. */
  nextLead: Lead | null;
}

type MobileTab = "property" | "agents";

export default function LeadWorkspace({
  lead,
  property,
  comps,
  shortlist,
  candidates,
  activity,
  nextLead,
}: Props) {
  const [tab, setTab] = useState<MobileTab>("property");
  const router = useRouter();

  // Candidate picks are UI-only for the demo — the real flow is
  // promote-then-pick, which needs a server round-trip we haven't
  // wired yet. Local Set keeps the checkbox interactive and feeds the
  // recipient count so the send bar reflects reality.
  const [candidatePicks, setCandidatePicks] = useState<Set<string>>(new Set());
  function toggleCandidatePick(candidateId: string) {
    setCandidatePicks((prev) => {
      const next = new Set(prev);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  }

  // Mobile send button animation state — mirrors the desktop SendBar
  // pattern (sending → sent → idle). Demo-safe: no server call yet.
  type MobileSendState = "idle" | "sending" | "sent";
  const [mobileSendState, setMobileSendState] =
    useState<MobileSendState>("idle");
  const mobileSendTimer = useRef<number | null>(null);

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
    () =>
      optimisticShortlist.filter((e) => e.pick !== null).length +
      candidatePicks.size,
    [optimisticShortlist, candidatePicks]
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

  /*
   * Fan-out state. Keyed by agent id → per-channel status + reply.
   * Timers run in the browser and progress each agent through
   * queued → sending → sent → awaiting → yes/no. Real Postmark /
   * TransmitSMS webhooks replace the timers later; nothing else here
   * has to change.
   */
  const [statuses, setStatuses] = useState<Map<string, AgentRowStatus>>(
    new Map()
  );
  const [vendorSent, setVendorSent] = useState(false);
  const timers = useRef<number[]>([]);
  useEffect(() => {
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };
  }, []);

  const scheduleUpdate = useCallback(
    (agentId: string, patch: Partial<AgentRowStatus>, delay: number) => {
      const id = window.setTimeout(() => {
        setStatuses((prev) => {
          const next = new Map(prev);
          const current = next.get(agentId) ?? {
            sms: "idle",
            email: "idle",
            reply: "none",
          };
          next.set(agentId, { ...current, ...patch });
          return next;
        });
      }, delay);
      timers.current.push(id);
    },
    []
  );

  const fanOutToPicked = useCallback(() => {
    const pickedIds = optimisticShortlist
      .filter((e) => e.pick !== null)
      .map((e) => e.agent.id);
    if (pickedIds.length === 0) return;

    // Initial pass: everyone queued. Staggered per-row so the eye
    // tracks each row lighting up rather than a flash of green.
    const initial = new Map<string, AgentRowStatus>();
    pickedIds.forEach((id) =>
      initial.set(id, { sms: "queued", email: "queued", reply: "none" })
    );
    setStatuses(initial);

    pickedIds.forEach((id, i) => {
      const stagger = i * 220;
      scheduleUpdate(id, { sms: "sending", email: "sending" }, stagger + 500);
      scheduleUpdate(id, { sms: "sent", email: "sent" }, stagger + 1500);
      scheduleUpdate(id, { reply: "awaiting" }, stagger + 2000);
      // Simulated reply latency 3–7s. Most say yes; small chance of
      // no keeps the "declined" state demoable.
      const replyDelay = 3000 + Math.floor(Math.random() * 4000);
      const outcome: "yes" | "no" = Math.random() < 0.82 ? "yes" : "no";
      scheduleUpdate(id, { reply: outcome }, stagger + 2000 + replyDelay);
    });
  }, [optimisticShortlist, scheduleUpdate]);

  const [vendorModalOpen, setVendorModalOpen] = useState(false);
  const [callTarget, setCallTarget] = useState<Agent | AgentCandidate | null>(
    null
  );
  const [templatePack, setTemplatePack] = useState<"sms" | "email" | null>(
    null
  );
  /*
   * Send-time opt-in: also fire the full agent brief to every
   * confirmed agent when the vendor packet goes out. Dedupes against
   * agents who already got the brief via the auto-YES reply path.
   * Default on — Sarah can uncheck if she's already briefed everyone
   * manually.
   */
  const [briefAgentsOnSend, setBriefAgentsOnSend] = useState(true);
  const [briefsSentCount, setBriefsSentCount] = useState(0);

  function handleSendToVendor() {
    setVendorSent(true);
    setBriefsSentCount(briefAgentsOnSend ? briefsNeededCount : 0);
    setVendorModalOpen(true);
  }

  /*
   * Manual call confirm — sets the row into a "confirmed via call"
   * state without simulating the SMS/email fan-out. The pill logic
   * treats sms/email = 'idle' + reply = 'yes' as call-only confirm,
   * so only the Confirmed pill shows and the row edge goes green.
   */
  function handleCallConfirm(subjectId: string) {
    setStatuses((prev) => {
      const next = new Map(prev);
      next.set(subjectId, {
        sms: "idle",
        email: "idle",
        reply: "yes",
      });
      return next;
    });
  }
  function handleCallDecline(subjectId: string) {
    setStatuses((prev) => {
      const next = new Map(prev);
      next.set(subjectId, {
        sms: "idle",
        email: "idle",
        reply: "no",
      });
      return next;
    });
  }
  function handleContinueToNext() {
    setVendorModalOpen(false);
    if (nextLead) router.push(`/leads/${nextLead.id}`);
  }

  // Which picked agents actually confirmed — the vendor packet lists
  // only these. Computed off the current statuses so the modal shows
  // the same names the row edges have gone green for.
  const confirmedAgents = useMemo(() => {
    return optimisticShortlist
      .filter((e) => e.pick !== null && statuses.get(e.agent.id)?.reply === "yes")
      .map((e) => e.agent);
  }, [optimisticShortlist, statuses]);

  /*
   * Agents who confirmed manually (Sarah's ✓ button) rather than via
   * the auto SMS/email YES reply path. These are the ones the auto
   * brief never fired for — so at Send-to-Vendor time, if the opt-in
   * is on, they're the ones that need the brief now. Everyone else
   * (auto-confirmed) already got it and gets deduped.
   */
  const briefsNeededCount = useMemo(() => {
    return confirmedAgents.reduce((n, a) => {
      const s = statuses.get(a.id);
      const alreadyBriefed = s?.sms === "sent" || s?.email === "sent";
      return n + (alreadyBriefed ? 0 : 1);
    }, 0);
  }, [confirmedAgents, statuses]);

  const phase = useMemo(
    () => derivePhase(statuses, vendorSent),
    [statuses, vendorSent]
  );
  const awaitingCount = useMemo(() => countAwaiting(statuses), [statuses]);
  const confirmedCount = useMemo(() => countConfirmed(statuses), [statuses]);

  function triggerMobileSend() {
    if (mobileSendState !== "idle" || recipientCount === 0) return;
    setMobileSendState("sending");
    if (mobileSendTimer.current) window.clearTimeout(mobileSendTimer.current);
    mobileSendTimer.current = window.setTimeout(() => {
      setMobileSendState("sent");
      mobileSendTimer.current = window.setTimeout(
        () => setMobileSendState("idle"),
        1600
      );
    }, 1400);
    fanOutToPicked();
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
            <div className="mt-3 flex items-center gap-2">
              <User size={16} aria-hidden className="text-text-muted" />
              <span className="t-section leading-tight">
                {lead.vendor_name}
              </span>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 t-body text-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <PhoneIcon size={13} aria-hidden />
                <span className="tabular">{lead.phone}</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Mail size={13} aria-hidden />
                <a
                  href={`mailto:${lead.email}`}
                  className="hover:text-text truncate max-w-[280px]"
                >
                  {lead.email}
                </a>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setTemplatePack("sms")}
              className="neu-raised-sm px-3 py-2 t-body flex items-center gap-2"
            >
              <MessageSquare size={14} />
              SMS pack
            </button>
            <button
              type="button"
              onClick={() => setTemplatePack("email")}
              className="neu-raised-sm px-3 py-2 t-body flex items-center gap-2"
            >
              <Mail size={14} />
              Email pack
            </button>
            <Link
              href={`/leads/${lead.id}/compare`}
              className="neu-raised-sm px-3 py-2 t-body flex items-center gap-2"
            >
              <BarChart3 size={14} />
              Compare
            </Link>
          </div>
        </div>
      </header>

      {/* -------- Mobile tabs (hidden on desktop) -------- */}
      <div className="md:hidden neu-raised p-1 flex gap-1 -mt-4">
        {(["property", "agents"] as const).map((k) => (
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
        // 12-col grid: 5/7, 24px gutter. Each column is its own
        // sticky, viewport-height, internally-scrollable pane on md+ so
        // scrolling the Report tab doesn't drag the shortlist along.
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* ---------- LEFT: property ---------- */}
          <section
            data-col="left"
            className={cn(
              "md:col-span-5 flex flex-col gap-6",
              "md:sticky md:top-4 md:self-start md:max-h-[calc(100dvh-8rem)] md:overflow-y-auto md:pr-1 md:pb-2",
              tab === "property" ? "block" : "hidden md:flex"
            )}
          >
            <div id="property-edit" className="scroll-mt-4">
              <PropertyHero
                leadPublicId={lead.id}
                property={property?.facts ?? {}}
                initialVersion={property?.version ?? 0}
              />
            </div>
            <PropertyTabs
              lead={lead}
              property={property?.facts ?? {}}
              comps={comps}
              history={activity}
            />
          </section>

          {/* ---------- RIGHT: shortlist ---------- */}
          <section
            data-col="centre"
            className={cn(
              "md:col-span-7 flex flex-col gap-4",
              "md:sticky md:top-4 md:self-start md:max-h-[calc(100dvh-8rem)] md:overflow-y-auto md:pr-1 md:pb-2",
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
                    status={statuses.get(entry.agent.id)}
                    onCall={(a) => setCallTarget(a)}
                    onSms={() => setTemplatePack("sms")}
                    onEmail={() => setTemplatePack("email")}
                    onConfirm={handleCallConfirm}
                    onDecline={handleCallDecline}
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
                      <CandidateRow
                        leadPublicId={lead.id}
                        candidate={c}
                        picked={candidatePicks.has(c.id)}
                        onTogglePick={toggleCandidatePick}
                        onCall={(cand) => setCallTarget(cand)}
                        status={statuses.get(c.id)}
                        onConfirm={handleCallConfirm}
                        onDecline={handleCallDecline}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </div>
      )}

      {/* Desktop slide-in send bar */}
      {!isEmpty ? (
        <SendBar
          recipientCount={recipientCount}
          phase={phase}
          awaitingCount={awaitingCount}
          confirmedCount={confirmedCount}
          briefsNeededCount={briefsNeededCount}
          briefAgents={briefAgentsOnSend}
          onToggleBriefAgents={() => setBriefAgentsOnSend((v) => !v)}
          onSend={fanOutToPicked}
          onSendToVendor={handleSendToVendor}
        />
      ) : null}

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
            onClick={triggerMobileSend}
            className="btn-accent-glass min-w-[112px] justify-center"
            disabled={recipientCount === 0 || mobileSendState !== "idle"}
            aria-busy={mobileSendState !== "idle"}
          >
            {mobileSendState === "idle" ? (
              <>
                <Send size={16} />
                Send
              </>
            ) : mobileSendState === "sending" ? (
              <>
                <Send size={16} className="anim-send-fly" aria-hidden />
                <span className="flex items-center gap-0.5">
                  Sending
                  <span className="anim-pulse-dot">.</span>
                  <span className="anim-pulse-dot anim-pulse-dot-2">.</span>
                  <span className="anim-pulse-dot anim-pulse-dot-3">.</span>
                </span>
              </>
            ) : (
              <>
                <Check size={16} className="anim-spring" aria-hidden />
                Sent
              </>
            )}
          </button>
        </BottomActionBar>
      ) : null}

      {/* Reserve room on mobile so the pinned bar never covers the last card */}
      <div className="md:hidden h-24" />

      <VendorSuccessModal
        open={vendorModalOpen}
        vendor={lead}
        agents={confirmedAgents.map((a) => ({
          name: a.name,
          agency: a.agency,
          nearbySales: a.nearby_sales,
          membership: a.membership_status,
          rating: agentRating(a),
        }))}
        briefsSentCount={briefsSentCount}
        nextLead={nextLead}
        onContinue={handleContinueToNext}
        onClose={() => setVendorModalOpen(false)}
      />

      <CallPanel
        open={callTarget !== null}
        subject={callTarget}
        onClose={() => setCallTarget(null)}
        onConfirm={handleCallConfirm}
        onDecline={handleCallDecline}
      />

      <TemplatePackModal
        open={templatePack !== null}
        kind={templatePack ?? "sms"}
        onClose={() => setTemplatePack(null)}
        vendor={lead}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* VendorSuccessModal — vendor email preview + send confirmation.     */
/*                                                                    */
/* Renders as the actual email that gets sent to the vendor: sender/  */
/* recipient/subject header, a friendly body naming each confirmed    */
/* agent with a one-line reason, and a sign-off. This is what Sarah   */
/* would show the vendor over the phone; it's not just a receipt.     */
/* The primary CTA jumps to the next lead so she flows through the    */
/* inbox without bouncing back.                                       */
/* ------------------------------------------------------------------ */
interface VendorAgent {
  name: string;
  agency: string;
  nearbySales: number;
  membership: "signed" | "verbal" | string;
  rating: number;
}

function VendorSuccessModal({
  open,
  vendor,
  agents,
  briefsSentCount,
  nextLead,
  onContinue,
  onClose,
}: {
  open: boolean;
  vendor: Lead;
  agents: VendorAgent[];
  /** Agents who received the full brief email at the same moment the
      vendor packet fired (deduped: those who already had it via YES
      reply aren't counted). Zero when Sarah unticked the opt-in. */
  briefsSentCount: number;
  nextLead: Lead | null;
  onContinue: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const firstName = vendor.vendor_name.split(" ")[0] ?? vendor.vendor_name;
  const subject = `Recommended agents for ${vendor.address}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vendor-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm anim-fade-in"
      />
      <div className="relative neu-raised max-w-4xl w-full max-h-[92vh] overflow-y-auto flex flex-col anim-modal-in">
        {/* --- Modal header: sent confirmation strip --- */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border-strong/60 shrink-0">
          <div
            className="h-9 w-9 rounded-neu-pill flex items-center justify-center shrink-0"
            style={{ background: "var(--success-bg)", color: "var(--success)" }}
          >
            <Check size={18} className="anim-spring" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="vendor-modal-title" className="t-body font-semibold">
              Vendor packet sent
            </h2>
            <p className="t-caption text-text-muted">
              {agents.length} confirmed agent{agents.length === 1 ? "" : "s"}{" "}
              · delivered to {vendor.vendor_name}
            </p>
          </div>
          {briefsSentCount > 0 ? (
            <span
              className="chip chip-info flex items-center gap-1 shrink-0"
              title={`Full brief also emailed to ${briefsSentCount} manually-confirmed agent${briefsSentCount === 1 ? "" : "s"} (auto-YES replies already had it)`}
            >
              <Send size={11} aria-hidden />
              Brief sent to {briefsSentCount} agent
              {briefsSentCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>

        {/* --- Email preview: what actually landed in their inbox --- */}
        <div className="px-6 py-5 flex flex-col gap-4">
          <div className="surface-flat p-4 flex flex-col gap-2.5">
            <EmailHeaderRow label="From" value="consultant@mytopagent.co.nz" />
            <EmailHeaderRow label="To" value={vendor.email} strong />
            <EmailHeaderRow label="Subject" value={subject} strong />
          </div>

          <div
            className="surface-flat overflow-hidden flex flex-col"
            style={{ background: "var(--surface)" }}
          >
            {/* Brand header inside the email body */}
            <div
              className="flex items-center gap-3 px-6 py-4 border-b"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="h-10 w-10 rounded-neu-sm flex items-center justify-center bg-white shadow-sm shrink-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/logo-mta.png"
                  alt="MyTopAgent"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="t-body font-bold leading-tight">
                  MyTopAgent
                </div>
                <div className="t-caption text-text-muted">
                  Match with New Zealand&apos;s top-performing real estate
                  agents
                </div>
              </div>
            </div>

            {/* Email body */}
            <div className="px-6 py-5 flex flex-col gap-4">
              <p className="t-body">Kia ora {firstName},</p>
              <p className="t-body">
                <span className="font-semibold">Great news</span> — {""}
                {agents.length} top-performing agent
                {agents.length === 1 ? "" : "s"} in your area{" "}
                {agents.length === 1 ? "has" : "have"} confirmed and{" "}
                {agents.length === 1 ? "is" : "are"} keen to pitch to sell{" "}
                <span className="font-medium">{vendor.address}</span>.
                We&apos;ve ranked them based on nearby sales, average days on
                market and overall track record.
              </p>

              <ul className="flex flex-col gap-2.5">
                {agents.map((a) => (
                  <VendorAgentCard key={a.name} agent={a} />
                ))}
              </ul>

              <div
                className="p-3 rounded-neu-sm flex items-start gap-2.5"
                style={{
                  background: "var(--accent-soft-bg)",
                  color: "var(--accent)",
                }}
              >
                <Send size={14} className="mt-0.5 shrink-0" aria-hidden />
                <p className="t-body">
                  <span className="font-semibold">Ready to meet them?</span>{" "}
                  Reply to this email with your preferred agent, or give me a
                  call — I&apos;ll book you in.
                </p>
              </div>

              {/* Signature block */}
              <div
                className="pt-3 mt-1 flex flex-col gap-0.5 border-t"
                style={{ borderColor: "var(--border)" }}
              >
                <p className="t-body">Ngā mihi,</p>
                <p className="t-body font-bold">The MyTopAgent Team</p>
                <p className="t-caption text-text-muted">
                  Your consultant · MyTopAgent
                </p>
              </div>
            </div>

            {/* Email footer strip */}
            <div
              className="px-6 py-3 border-t flex items-center justify-between gap-3 flex-wrap"
              style={{
                borderColor: "var(--border)",
                background: "var(--neutral-bg)",
              }}
            >
              <span className="t-caption text-text-subtle">
                MyTopAgent · mytopagent.co.nz · Auckland, NZ
              </span>
              <span className="t-caption text-text-subtle">
                This is a private introduction. Please don&apos;t forward.
              </span>
            </div>
          </div>
        </div>

        {/* --- Footer CTA --- */}
        <div className="px-6 pb-6 pt-2 flex flex-col gap-2 shrink-0">
          {nextLead ? (
            <>
              <button
                type="button"
                onClick={onContinue}
                className="btn-accent-glass justify-center"
              >
                Continue to next lead
                <ArrowRight size={16} aria-hidden />
              </button>
              <div className="t-caption text-text-subtle text-center">
                Next: <span className="text-text-muted">{nextLead.address}</span>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="btn-accent-glass justify-center"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function EmailHeaderRow({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3 t-caption">
      <span className="text-text-subtle w-14 shrink-0 uppercase tracking-wide">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate tabular",
          strong ? "text-text font-medium t-body" : "text-text-muted"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function VendorAgentCard({ agent }: { agent: VendorAgent }) {
  const membershipLabel =
    agent.membership === "signed" ? "Signed MTA agent" : "Verbal agreement";
  const ratingPalette =
    agent.rating >= 8.5
      ? { bg: "var(--success-bg)", fg: "var(--success)" }
      : agent.rating >= 7
        ? { bg: "var(--warning-bg)", fg: "var(--warning)" }
        : { bg: "var(--neutral-bg)", fg: "var(--text-muted)" };
  return (
    <li
      className="p-3.5 rounded-neu-sm flex items-start gap-3 border transition-colors"
      style={{
        borderColor: "var(--border)",
        background: "var(--surface-elevated, var(--surface))",
      }}
    >
      <span
        className="shrink-0 h-11 min-w-[46px] px-2 rounded-neu-sm flex flex-col items-center justify-center tabular font-bold"
        style={{ background: ratingPalette.bg, color: ratingPalette.fg }}
        aria-label={`Rating ${agent.rating.toFixed(1)} out of 10`}
      >
        <span className="text-[15px] leading-tight">
          {agent.rating.toFixed(1)}
        </span>
        <span className="text-[9px] font-medium opacity-80 leading-tight">
          / 10
        </span>
      </span>
      <div className="min-w-0 flex-1 flex flex-col gap-1">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="t-body font-semibold">{agent.name}</span>
          <span className="t-caption text-text-muted">{agent.agency}</span>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-0.5 t-caption text-text-muted">
          <li className="inline-flex items-center gap-1">
            <Check
              size={11}
              aria-hidden
              style={{ color: "var(--success)" }}
            />
            {membershipLabel}
          </li>
          <li className="inline-flex items-center gap-1 tabular">
            <Check
              size={11}
              aria-hidden
              style={{ color: "var(--success)" }}
            />
            {agent.nearbySales} nearby sale
            {agent.nearbySales === 1 ? "" : "s"}
          </li>
        </ul>
      </div>
    </li>
  );
}
