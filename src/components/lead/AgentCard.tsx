"use client";

import { useState } from "react";
import { Check, MessageSquare, Phone } from "lucide-react";
import type { Agent } from "@/lib/mock";
import { cn } from "@/lib/utils";

interface AgentCardProps {
  agent: Agent;
  picked: boolean;
  onToggle: (agentId: string) => void;
  onReasonChange?: (agentId: string, reason: string) => void;
  defaultReason?: string;
}

export function AgentCard({
  agent,
  picked,
  onToggle,
  onReasonChange,
  defaultReason,
}: AgentCardProps) {
  const [reason, setReason] = useState(defaultReason ?? agent.reason_hint);

  return (
    <div
      className={cn(
        "p-4 flex flex-col gap-3 transition-shadow",
        picked ? "neu-inset" : "neu-raised"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="t-default font-semibold">{agent.name}</div>
          <div className="t-caption text-text-muted">{agent.agency}</div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={picked}
          aria-label={picked ? `Unpick ${agent.name}` : `Pick ${agent.name}`}
          onClick={() => onToggle(agent.id)}
          className={cn(
            "h-8 w-8 flex items-center justify-center transition-colors rounded-neu-sm",
            picked
              ? "bg-accent text-on-accent"
              : "neu-raised-sm text-text-muted"
          )}
        >
          {picked ? <Check size={16} /> : null}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {agent.membership_status === "signed" ? (
          <span className="chip chip-success">Signed</span>
        ) : agent.membership_status === "verbally_agreed" ? (
          <span className="chip chip-warning">Verbal</span>
        ) : (
          <span className="chip chip-neutral">Not signed</span>
        )}
        {agent.sms_permission ? (
          <span className="chip chip-info">
            <MessageSquare size={11} /> SMS OK
          </span>
        ) : (
          <span className="chip chip-neutral">No SMS</span>
        )}
        <span className="chip chip-neutral tabular">
          {agent.nearby_sales} nearby
        </span>
        <span className="chip chip-neutral tabular">
          {agent.sales_last_12mo}/yr
        </span>
      </div>

      <label className="flex flex-col gap-1">
        <span className="t-caption text-text-muted">Reason for vendor</span>
        <textarea
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            onReasonChange?.(agent.id, e.target.value);
          }}
          rows={2}
          className="neu-input resize-none"
          placeholder="Why this agent for this vendor?"
        />
      </label>

      <div className="flex items-center gap-2 t-caption text-text-muted">
        <Phone size={12} />
        <span className="tabular">{agent.phone}</span>
      </div>
    </div>
  );
}
