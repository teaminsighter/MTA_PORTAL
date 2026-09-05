"use client";

import { useId, useState } from "react";
import { Check, ChevronDown, MessageSquare, Phone } from "lucide-react";
import type { Agent } from "@/lib/mock";
import { cn } from "@/lib/utils";

interface AgentRowProps {
  agent: Agent;
  picked: boolean;
  onToggle: (agentId: string) => void;
}

/*
 * Collapsed height ≈ 56px. Five rows fit in the 5-column workspace
 * centre column without scrolling at 1440.
 * Expanded panel is animated with the .expand-row grid-rows trick so
 * we never have to measure content height for a smooth transition.
 */
export function AgentRow({ agent, picked, onToggle }: AgentRowProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return (
    <div
      className={cn(
        "flex flex-col transition-shadow",
        picked ? "neu-inset" : "neu-raised-sm"
      )}
    >
      {/* Row header: click anywhere but the tick to expand */}
      <div className="flex items-center gap-3 pl-4 pr-2 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex-1 flex items-center gap-3 min-w-0 text-left"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className="t-body font-semibold truncate">{agent.name}</span>
              <span className="t-caption text-text-muted truncate">
                {agent.agency}
              </span>
            </div>
          </div>

          {/* Compact chip row */}
          <div className="hidden sm:flex items-center gap-1.5 shrink-0">
            {agent.membership_status === "signed" ? (
              <span className="chip chip-success">Signed</span>
            ) : (
              <span className="chip chip-warning">Verbal</span>
            )}
            {agent.sms_permission ? (
              <span className="chip chip-info" aria-label="SMS consent">
                <MessageSquare size={11} /> SMS
              </span>
            ) : null}
            <span className="chip chip-neutral tabular">
              {agent.nearby_sales} nearby
            </span>
          </div>

          <ChevronDown
            size={16}
            aria-hidden
            className={cn(
              "text-text-muted transition-transform",
              open && "rotate-180"
            )}
          />
        </button>

        <button
          type="button"
          role="switch"
          aria-checked={picked}
          aria-label={picked ? `Unpick ${agent.name}` : `Pick ${agent.name}`}
          onClick={() => onToggle(agent.id)}
          className={cn(
            "h-8 w-8 shrink-0 rounded-neu-sm flex items-center justify-center transition-colors",
            picked ? "text-on-accent" : "neu-raised-sm text-text-muted"
          )}
          style={picked ? { background: "var(--accent-gradient)" } : undefined}
        >
          {picked ? <Check size={16} className="anim-spring" /> : null}
        </button>
      </div>

      {/* Expandable body — smoothly animated via grid-rows */}
      <div id={panelId} className="expand-row" data-open={open}>
        <div>
          <div className="px-4 pb-4 pt-1 flex flex-col gap-3 border-t">
            <label className="flex flex-col gap-1">
              <span className="t-caption text-text-muted">
                Reason for vendor
              </span>
              <textarea
                defaultValue={agent.reason_hint}
                rows={2}
                className="neu-input resize-none"
                placeholder="Why this agent for this vendor?"
              />
            </label>
            <div className="flex flex-wrap items-center gap-3 t-caption text-text-muted">
              <span className="inline-flex items-center gap-1">
                <Phone size={12} />
                <span className="tabular">{agent.phone}</span>
              </span>
              <span aria-hidden>·</span>
              <span>{agent.sales_last_12mo}/yr</span>
              <span aria-hidden>·</span>
              <span>{agent.avg_days_on_market} avg days</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
