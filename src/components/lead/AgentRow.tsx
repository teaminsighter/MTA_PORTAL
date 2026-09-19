"use client";

import { useState } from "react";
import {
  Check,
  Clock,
  Loader2,
  Mail,
  MessageSquare,
  X,
} from "lucide-react";
import type { Agent } from "@/lib/mock";
import type { PickInfo } from "@/lib/repo/agents";
import { cn } from "@/lib/utils";
import type { AgentRowStatus, ChannelStatus } from "@/lib/lead/send-flow";
import { agentRating, ratingTier } from "@/lib/lead/agent-rating";
import { RowActions } from "./RowActions";

interface AgentRowProps {
  leadPublicId: string;
  agent: Agent;
  pick: PickInfo | null;
  picked: boolean;
  togglePending?: boolean;
  onToggle: (agentId: string) => void;
  /** Send/reply status once a fan-out has been triggered. */
  status?: AgentRowStatus;
  /** Opens the animated call panel for this agent. */
  onCall?: (agent: Agent) => void;
  /** Opens the SMS composer for this agent. */
  onSms?: (agent: Agent) => void;
  /** Opens the Email composer for this agent. */
  onEmail?: (agent: Agent) => void;
  /** Manual override: mark this agent confirmed (e.g. after a phone call
      or when the SMS automation missed). Same state as an auto "yes" reply. */
  onConfirm?: (agentId: string) => void;
  /** Manual override: mark this agent declined. */
  onDecline?: (agentId: string) => void;
}

/*
 * One shortlist row.
 *
 * Row anatomy (picked):
 *   [☐ pick]  name · agency   [chips / fan-out pills]  [SMS][Email][Call] ▾   [✓][✗]
 *
 * The right-edge tick used to double as both "picked" and "confirmed",
 * which meant Sarah couldn't distinguish "I picked this agent" from
 * "the agent said yes". Split now: pick sits on the left as a light
 * checkbox, Confirm/Decline on the right stamp the reply state
 * directly (mirrors the auto SMS→Email→awaiting→yes/no path, minus
 * the timers — useful when a reply comes back by phone or the
 * automation just missed).
 */
export function AgentRow({
  leadPublicId: _leadPublicId,
  agent,
  pick: _pick,
  picked,
  togglePending,
  onToggle,
  status,
  onCall,
  onSms,
  onEmail,
  onConfirm,
  onDecline,
}: AgentRowProps) {
  const confirmed = status?.reply === "yes";
  const declined = status?.reply === "no";
  const inFanOut =
    status !== undefined && (status.sms !== "idle" || status.email !== "idle");
  const showReplyPill = status !== undefined && status.reply !== "none";

  const [menuOpen, setMenuOpen] = useState(false);
  const canOpenMenu = !inFanOut;

  return (
    <div
      className={cn(
        "flex flex-col transition-shadow",
        picked ? "neu-inset" : "neu-raised-sm",
        confirmed && "row-confirmed",
        declined && "opacity-70"
      )}
    >
      <div className="flex items-center gap-3 pl-2 pr-2 py-3">
        <PickToggle
          picked={picked}
          disabled={togglePending || inFanOut}
          agentName={agent.name}
          onToggle={() => onToggle(agent.id)}
        />

        <RatingBadge score={agentRating(agent)} />

        <button
          type="button"
          disabled={!canOpenMenu}
          onClick={() => canOpenMenu && setMenuOpen((v) => !v)}
          aria-label={`Open actions for ${agent.name}`}
          aria-haspopup={canOpenMenu ? "menu" : undefined}
          aria-expanded={canOpenMenu ? menuOpen : undefined}
          className={cn(
            "flex items-center gap-2 min-w-0 text-left flex-1 -my-3 py-3 rounded-l-neu",
            canOpenMenu &&
              "hover:bg-neutral-bg/60 cursor-pointer transition-colors"
          )}
        >
          <span className="t-body font-semibold truncate">{agent.name}</span>
          <span className="t-caption text-text-muted truncate">
            {agent.agency}
          </span>
        </button>

        {inFanOut ? (
          <SendStatusPills status={status!} />
        ) : (
          <>
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              {agent.membership_status === "signed" ? (
                <span className="chip chip-success">Signed</span>
              ) : (
                <span className="chip chip-warning">Verbal</span>
              )}
              <span className="chip chip-neutral tabular">
                {agent.nearby_sales} nearby
              </span>
            </div>

            {showReplyPill ? <ReplyPill state={status!.reply} /> : null}

            <RowActions
              phone={agent.phone}
              email={agent.email}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              onCall={() => onCall?.(agent)}
              onSms={() => onSms?.(agent)}
              onEmail={() => onEmail?.(agent)}
              onCombo={() => onSms?.(agent)}
            />
          </>
        )}

        {picked ? (
          <ConfirmDeclineCluster
            reply={status?.reply ?? "none"}
            onConfirm={() => onConfirm?.(agent.id)}
            onDecline={() => onDecline?.(agent.id)}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Rating badge — small pill leading the name. Tiered colour so Sarah */
/* can scan the shortlist for the strongest performers at a glance,   */
/* without having to compare individual sales / DOM numbers row-to-   */
/* row. Score derivation lives in @/lib/lead/agent-rating.            */
/* ------------------------------------------------------------------ */
function RatingBadge({ score }: { score: number }) {
  const tier = ratingTier(score);
  const palette =
    tier === "excellent"
      ? { bg: "var(--success-bg)", fg: "var(--success)" }
      : tier === "strong"
        ? { bg: "var(--warning-bg)", fg: "var(--warning)" }
        : { bg: "var(--neutral-bg)", fg: "var(--text-muted)" };
  return (
    <span
      className="shrink-0 h-7 min-w-[36px] px-1.5 rounded-neu-sm flex items-center justify-center tabular font-semibold text-[13px]"
      style={{ background: palette.bg, color: palette.fg }}
      title={`Performance rating: ${score.toFixed(1)} out of 10`}
      aria-label={`Rating ${score.toFixed(1)} out of 10`}
    >
      {score.toFixed(1)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Pick toggle — left-side lighter checkbox. Distinguishes "picked    */
/* for outreach" from "agent confirmed reply" (right-side cluster).   */
/* ------------------------------------------------------------------ */
function PickToggle({
  picked,
  disabled,
  agentName,
  onToggle,
}: {
  picked: boolean;
  disabled?: boolean;
  agentName: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={picked}
      aria-label={picked ? `Unpick ${agentName}` : `Pick ${agentName}`}
      onClick={onToggle}
      disabled={disabled}
      className={cn(
        "h-6 w-6 shrink-0 rounded-neu-sm flex items-center justify-center transition-colors",
        picked ? "text-on-accent" : "neu-raised-sm text-text-subtle",
        disabled && "opacity-60 cursor-not-allowed"
      )}
      style={picked ? { background: "var(--accent-gradient)" } : undefined}
    >
      {picked ? <Check size={13} className="anim-spring" /> : null}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Manual Confirm / Decline cluster — right edge for picked rows.     */
/* Clickable at any time (before send, during "Awaiting", or as an    */
/* override when the SMS automation missed and the reply came back    */
/* via phone). Stamps the same reply state as the auto flow, so the   */
/* row edge, confirmed-count and vendor packet stay in sync.          */
/* ------------------------------------------------------------------ */
function ConfirmDeclineCluster({
  reply,
  onConfirm,
  onDecline,
}: {
  reply: AgentRowStatus["reply"];
  onConfirm: () => void;
  onDecline: () => void;
}) {
  const isConfirmed = reply === "yes";
  const isDeclined = reply === "no";
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={onConfirm}
        aria-label="Mark confirmed"
        aria-pressed={isConfirmed}
        title="Mark confirmed"
        className={cn(
          "h-8 w-8 rounded-neu-sm flex items-center justify-center transition-all",
          isConfirmed
            ? "text-on-accent shadow-sm"
            : "neu-raised-sm text-text-muted hover:text-[color:var(--success)]"
        )}
        style={
          isConfirmed ? { background: "var(--success)" } : undefined
        }
      >
        <Check
          size={15}
          className={isConfirmed ? "anim-spring" : ""}
          aria-hidden
        />
      </button>
      <button
        type="button"
        onClick={onDecline}
        aria-label="Mark declined"
        aria-pressed={isDeclined}
        title="Mark declined"
        className={cn(
          "h-8 w-8 rounded-neu-sm flex items-center justify-center transition-all",
          isDeclined
            ? "text-on-accent shadow-sm"
            : "neu-raised-sm text-text-muted hover:text-[color:var(--danger)]"
        )}
        style={
          isDeclined ? { background: "var(--danger)" } : undefined
        }
      >
        <X
          size={15}
          className={isDeclined ? "anim-spring" : ""}
          aria-hidden
        />
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Send status pills — shown while a fan-out is progressing for this  */
/* agent. Each channel goes queued → sending → sent independently.    */
/* ------------------------------------------------------------------ */
function SendStatusPills({ status }: { status: AgentRowStatus }) {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <ChannelPill
        state={status.sms}
        icon={<MessageSquare size={11} aria-hidden />}
        label="SMS"
      />
      <ChannelPill
        state={status.email}
        icon={<Mail size={11} aria-hidden />}
        label="Email"
      />
      <ReplyPill state={status.reply} />
    </div>
  );
}

function ChannelPill({
  state,
  icon,
  label,
}: {
  state: ChannelStatus;
  icon: React.ReactNode;
  label: string;
}) {
  if (state === "idle") return null;
  const isSent = state === "sent";
  const isSending = state === "sending";
  const isQueued = state === "queued";
  return (
    <span
      className={cn(
        "chip tabular flex items-center gap-1",
        isSent && "chip-success",
        (isQueued || isSending) && "chip-queued"
      )}
    >
      {isSent ? (
        <Check size={11} className="anim-spring" aria-hidden />
      ) : isSending ? (
        <Loader2 size={11} className="anim-spin-slow" aria-hidden />
      ) : (
        icon
      )}
      <span>
        {label}{" "}
        {isSent ? "sent" : isSending ? "sending…" : "queued"}
      </span>
    </span>
  );
}

function ReplyPill({ state }: { state: AgentRowStatus["reply"] }) {
  if (state === "none") return null;
  if (state === "awaiting") {
    return (
      <span className="chip chip-warning flex items-center gap-1">
        <Clock size={11} aria-hidden className="anim-pulse-soft" />
        Awaiting reply
      </span>
    );
  }
  if (state === "yes") {
    return (
      <span className="chip chip-success flex items-center gap-1">
        <Check size={11} aria-hidden className="anim-spring" />
        Confirmed
      </span>
    );
  }
  return (
    <span className="chip chip-danger flex items-center gap-1">
      <X size={11} aria-hidden />
      Declined
    </span>
  );
}
