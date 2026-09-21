"use client";

import { useState } from "react";
import { Check, X } from "lucide-react";
import type { AgentCandidate } from "@/lib/mock";
import type { AgentRowStatus } from "@/lib/lead/send-flow";
import { cn } from "@/lib/utils";
import { CandidateSheet } from "./CandidateSheet";
import { RowActions } from "./RowActions";

interface CandidateRowProps {
  leadPublicId: string;
  candidate: AgentCandidate;
  picked?: boolean;
  onTogglePick?: (candidateId: string) => void;
  /** Opens the animated call panel. Falls back to the legacy outcome
      sheet when the parent hasn't supplied a handler. */
  onCall?: (candidate: AgentCandidate) => void;
  /** Same shape as AgentRow — a confirmed candidate glows green. */
  status?: AgentRowStatus;
  /** Manual overrides — mirror the AgentRow controls. */
  onConfirm?: (candidateId: string) => void;
  onDecline?: (candidateId: string) => void;
}

/*
 * Candidates surface from comparables and aren't in MTA yet, so the
 * row keeps a dashed border to stay visually distinct — but the
 * internal anatomy (pick · name/agency · chips · actions · confirm/
 * decline) matches AgentRow exactly.
 */
export function CandidateRow({
  leadPublicId,
  candidate,
  picked,
  onTogglePick,
  onCall,
  status,
  onConfirm,
  onDecline,
}: CandidateRowProps) {
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const confirmed = status?.reply === "yes";
  const declined = status?.reply === "no";

  const tone =
    candidate.confidence === "high"
      ? "chip-success"
      : candidate.confidence === "medium"
        ? "chip-warning"
        : "chip-neutral";

  function startCall() {
    if (onCall) onCall(candidate);
    else setOpen(true);
  }

  return (
    <>
      <div
        className={cn(
          "flex items-center gap-3 pl-2 pr-2 py-3 rounded-neu bg-surface",
          "border-2 border-dashed transition-shadow",
          confirmed && "row-confirmed",
          declined && "opacity-70"
        )}
        style={{ borderColor: "var(--border-strong)" }}
      >
        <button
          type="button"
          role="switch"
          aria-checked={!!picked}
          aria-label={picked ? `Unpick ${candidate.name}` : `Pick ${candidate.name}`}
          onClick={() => onTogglePick?.(candidate.id)}
          disabled={!onTogglePick}
          className={cn(
            "h-6 w-6 shrink-0 rounded-neu-sm flex items-center justify-center transition-colors",
            picked ? "text-on-accent" : "neu-raised-sm text-text-subtle",
            !onTogglePick && "opacity-40 cursor-not-allowed"
          )}
          style={picked ? { background: "var(--accent-gradient)" } : undefined}
        >
          {picked ? <Check size={13} className="anim-spring" /> : null}
        </button>

        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label={`Open actions for ${candidate.name}`}
          className="flex items-center gap-2 min-w-0 text-left flex-1 -my-3 py-3 rounded-l-neu hover:bg-neutral-bg/60 cursor-pointer transition-colors"
        >
          <span className="t-body font-semibold truncate">
            {candidate.name}
          </span>
          <span className="t-caption text-text-muted truncate">
            {candidate.agency}
          </span>
        </button>

        {confirmed ? (
          <span className="chip chip-success flex items-center gap-1 shrink-0">
            <Check size={11} aria-hidden className="anim-spring" />
            Confirmed
          </span>
        ) : declined ? (
          <span className="chip chip-danger flex items-center gap-1 shrink-0">
            <X size={11} aria-hidden />
            Declined
          </span>
        ) : (
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            <span className="chip chip-neutral">Candidate</span>
            <span className={cn("chip", tone, "capitalize")}>
              {candidate.confidence}
            </span>
          </div>
        )}

        <RowActions
          phone={candidate.phone}
          email={candidate.email}
          open={menuOpen}
          onOpenChange={setMenuOpen}
          onCall={startCall}
          onSms={() => console.log("[demo] sms candidate", candidate.name)}
          onEmail={() => console.log("[demo] email candidate", candidate.name)}
          onCombo={() => console.log("[demo] combo candidate", candidate.name)}
        />

        {onConfirm || onDecline ? (
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => onConfirm?.(candidate.id)}
              aria-label="Mark confirmed"
              aria-pressed={confirmed}
              title="Mark confirmed"
              className={cn(
                "h-8 w-8 rounded-neu-sm flex items-center justify-center transition-all",
                confirmed
                  ? "text-on-accent shadow-sm"
                  : "neu-raised-sm text-text-muted hover:text-[color:var(--success)]"
              )}
              style={confirmed ? { background: "var(--success)" } : undefined}
            >
              <Check
                size={15}
                className={confirmed ? "anim-spring" : ""}
                aria-hidden
              />
            </button>
            <button
              type="button"
              onClick={() => onDecline?.(candidate.id)}
              aria-label="Mark declined"
              aria-pressed={declined}
              title="Mark declined"
              className={cn(
                "h-8 w-8 rounded-neu-sm flex items-center justify-center transition-all",
                declined
                  ? "text-on-accent shadow-sm"
                  : "neu-raised-sm text-text-muted hover:text-[color:var(--danger)]"
              )}
              style={declined ? { background: "var(--danger)" } : undefined}
            >
              <X
                size={15}
                className={declined ? "anim-spring" : ""}
                aria-hidden
              />
            </button>
          </div>
        ) : null}
      </div>

      <CandidateSheet
        leadPublicId={leadPublicId}
        candidate={candidate}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
