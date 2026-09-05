import type { LeadState } from "@/lib/mock";
import { cn } from "@/lib/utils";

interface StateChipProps {
  state: LeadState;
  className?: string;
}

const LABELS: Record<LeadState, string> = {
  received: "Received",
  enriching: "Enriching",
  ready_for_review: "Ready to review",
  dispatching: "Dispatching",
  sent: "Sent",
  partial_send: "Partial send",
  awaiting_agent_responses: "Awaiting agents",
  agent_appointed: "Agent appointed",
  listed: "Listed",
  sold: "Sold",
  empty_workspace: "New",
};

const VARIANTS: Record<LeadState, string> = {
  received: "chip-neutral",
  enriching: "chip-info",
  ready_for_review: "chip-info",
  dispatching: "chip-warning",
  sent: "chip-success",
  partial_send: "chip-danger",
  awaiting_agent_responses: "chip-warning",
  agent_appointed: "chip-success",
  listed: "chip-success",
  sold: "chip-success",
  empty_workspace: "chip-neutral",
};

export function StateChip({ state, className }: StateChipProps) {
  return (
    <span className={cn("chip", VARIANTS[state], className)}>
      {LABELS[state]}
    </span>
  );
}
