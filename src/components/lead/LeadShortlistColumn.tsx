"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  UserPlus,
  Users,
} from "lucide-react";
import type { LeadPreview as LeadPreviewData } from "@/app/api/inbox/[id]/route";
import type { Agent, AgentCandidate, Lead } from "@/lib/mock";
import { ErrorState } from "@/components/states/ErrorState";
import { LoadingSkeleton } from "@/components/states/LoadingSkeleton";
import { cn } from "@/lib/utils";

const CONFIDENCE_TONE: Record<AgentCandidate["confidence"], string> = {
  high: "chip-success",
  medium: "chip-info",
  low: "chip-neutral",
};

/*
 * Shortlist column — the second stage of the inbox wizard.
 *
 * Left column is the compact LeadPreview (property context). This
 * column is the actionable surface: for every shortlisted agent
 * Sarah can Call, SMS, or Pick with a single tap. When she's happy
 * with her picks, the floating Send bar dispatches them.
 *
 * Demo-safe: picks + send are local state only. Real writes are
 * routed through the existing lead workspace server actions in
 * Phase 6; wiring them here is a follow-up once the wizard shape
 * is agreed with the client.
 */

interface Props {
  lead: Lead;
  onBack: () => void;
}

export function LeadShortlistColumn({ lead, onBack }: Props) {
  const query = useQuery<LeadPreviewData>({
    queryKey: ["inbox-preview", lead.id],
    queryFn: async () => {
      const res = await fetch(
        `/api/inbox/${encodeURIComponent(lead.id)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`shortlist fetch failed: ${res.status}`);
      return res.json();
    },
    refetchOnWindowFocus: true,
  });

  const agents = useMemo<Agent[]>(() => {
    const data = query.data;
    if (!data) return [];
    // Suggested_agents is the full shortlist (picked + unpicked). Dedupe
    // in case the API happened to include duplicates across arrays.
    const seen = new Set<string>();
    const combined = [...data.picked_agents, ...data.suggested_agents];
    return combined.filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  }, [query.data]);

  const candidates: AgentCandidate[] = query.data?.candidates ?? [];
  const suggestedCount = query.data?.counts.suggested_agents ?? agents.length;

  // Seed picks from the server payload's picked_agents so the operator
  // continues from where they were, then let local toggles take over.
  const [pickedIds, setPickedIds] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);
  if (!seeded && query.data) {
    setSeeded(true);
    setPickedIds(new Set(query.data.picked_agents.map((a) => a.id)));
  }

  const togglePick = (id: string) => {
    setPickedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const onSend = () => {
    if (pickedIds.size === 0 || sending) return;
    setSending(true);
    // Demo: fake a network delay so the button feedback is visible.
    setTimeout(() => {
      setSending(false);
      setSent(true);
      window.setTimeout(() => setSent(false), 2400);
    }, 700);
  };

  if (query.isError) {
    return (
      <div className="neu-raised p-6 w-full">
        <ErrorState onRetry={() => query.refetch()} />
      </div>
    );
  }
  if (!query.data) {
    return (
      <div className="neu-raised p-6 w-full">
        <LoadingSkeleton rows={5} />
      </div>
    );
  }

  const pickedCount = pickedIds.size;

  return (
    <div className="neu-raised p-6 flex flex-col gap-4 w-full anim-enter max-h-[calc(100dvh-8rem)] relative">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="neu-raised-sm h-9 w-9 flex items-center justify-center text-text-muted hover:text-accent shrink-0"
            aria-label="Back to property preview"
            title="Back to property preview"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="min-w-0">
            <div className="t-caption text-text-muted uppercase tracking-wide flex items-center gap-1">
              <Users size={12} /> Contact agents
            </div>
            <h2 className="t-section leading-tight truncate">{lead.address}</h2>
          </div>
        </div>
        <div className="t-caption text-text-muted tabular shrink-0 pt-1">
          <span className="text-text font-semibold">{pickedIds.size}</span>{" "}
          picked ·{" "}
          <span className="text-text font-semibold">{suggestedCount}</span>{" "}
          suggested
        </div>
      </div>

      {/* Scrolling body */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2 -mr-2 pr-2 pb-20">
        {agents.length === 0 ? (
          <p className="t-body text-text-muted py-8 text-center">
            No agents shortlisted yet.
          </p>
        ) : (
          agents.map((a) => {
            const picked = pickedIds.has(a.id);
            return (
              <div
                key={a.id}
                role="button"
                tabIndex={0}
                onClick={() => togglePick(a.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    togglePick(a.id);
                  }
                }}
                className={cn(
                  // Base has a transparent left border so the picked
                  // accent bar doesn't shift the row's width. Avoids
                  // ring-* which was leaking past the scroll clip and
                  // showing as an orange bar between rows.
                  "neu-raised-sm px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-all",
                  "border-l-4 border-l-transparent",
                  "hover:-translate-y-0.5",
                  picked && "border-l-accent bg-accent/[0.05]"
                )}
                aria-pressed={picked}
                aria-label={`${a.name} — ${picked ? "picked" : "not picked"}`}
              >
                <div className="min-w-0 flex items-center gap-3 flex-1">
                  <div className="min-w-0 flex-1">
                    <div className="t-body font-semibold truncate">
                      {a.name}
                    </div>
                    <div className="t-caption text-text-muted truncate">
                      {a.agency}
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                    {a.membership_status === "signed" ? (
                      <span className="chip chip-success">Signed</span>
                    ) : a.membership_status === "verbally_agreed" ? (
                      <span className="chip chip-warning">Verbal</span>
                    ) : null}
                    {a.sms_permission ? (
                      <span className="chip chip-info flex items-center gap-1">
                        <MessageSquare size={11} /> SMS
                      </span>
                    ) : null}
                    <span className="chip chip-neutral tabular">
                      {a.nearby_sales} nearby
                    </span>
                  </div>
                </div>
                <div
                  className="flex items-center gap-2 shrink-0"
                  onClick={(e) => e.stopPropagation()}
                >
                  <a
                    href={`tel:${a.phone.replace(/\s+/g, "")}`}
                    className="neu-raised-sm h-9 w-9 flex items-center justify-center text-accent hover:brightness-110"
                    aria-label={`Call ${a.name}`}
                    title={`Call ${a.name} (${a.phone})`}
                  >
                    <Phone size={15} />
                  </a>
                  {a.sms_permission ? (
                    <a
                      href={`sms:${a.phone.replace(/\s+/g, "")}`}
                      className="neu-raised-sm h-9 w-9 flex items-center justify-center text-accent hover:brightness-110"
                      aria-label={`SMS ${a.name}`}
                      title={`SMS ${a.name}`}
                    >
                      <MessageSquare size={15} />
                    </a>
                  ) : null}
                  <span
                    className={cn(
                      "chip flex items-center gap-1 min-w-[76px] justify-center",
                      picked ? "chip-success" : "chip-neutral"
                    )}
                  >
                    {picked ? (
                      <>
                        <Check size={12} /> Picked
                      </>
                    ) : (
                      "Pick"
                    )}
                  </span>
                </div>
              </div>
            );
          })
        )}

        {/* --- Candidates from nearby sales --- */}
        {candidates.length > 0 ? (
          <div className="pt-4 flex flex-col gap-2">
            <div className="t-caption text-text-subtle uppercase tracking-wide flex items-center gap-1">
              <UserPlus size={12} /> Candidates from nearby sales ·{" "}
              {candidates.length}
            </div>
            {candidates.map((c) => (
              <div
                key={c.id}
                className="neu-raised-sm px-4 py-3 flex items-center justify-between gap-3 border-l-4 border-l-transparent"
              >
                <div className="min-w-0 flex-1">
                  <div className="t-body font-semibold truncate">{c.name}</div>
                  <div className="t-caption text-text-muted truncate">
                    {c.agency}
                    {c.reason_hint ? (
                      <>
                        {" · "}
                        <span>{c.reason_hint}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={cn("chip", CONFIDENCE_TONE[c.confidence])}
                    title={`Match confidence: ${c.confidence}`}
                  >
                    {c.confidence}
                  </span>
                  <a
                    href={`tel:${c.phone.replace(/\s+/g, "")}`}
                    className="btn-accent-glass"
                    aria-label={`Call ${c.name}`}
                    title={`Call ${c.name} (${c.phone})`}
                  >
                    <Phone size={14} />
                    Call
                  </a>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Floating send bar */}
      <div className="absolute bottom-4 right-4 flex items-center gap-3 z-10">
        {sent ? (
          <span className="chip chip-success">Sent · demo</span>
        ) : null}
        {pickedCount > 0 ? (
          <div className="neu-raised-sm px-3 py-1.5 flex items-center gap-1 t-caption text-text-muted">
            <span className="tabular font-semibold text-text">
              {pickedCount}
            </span>
            picked
          </div>
        ) : null}
        <button
          type="button"
          onClick={onSend}
          disabled={pickedCount === 0 || sending}
          className={cn(
            "btn-accent-glass shadow-lg",
            (pickedCount === 0 || sending) && "opacity-60 cursor-not-allowed"
          )}
        >
          <Send size={16} />
          {sending ? "Sending…" : `Send to ${pickedCount || "0"} agent${pickedCount === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
