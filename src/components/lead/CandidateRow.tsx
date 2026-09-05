import { Phone } from "lucide-react";
import type { AgentCandidate } from "@/lib/mock";
import { cn } from "@/lib/utils";

interface CandidateRowProps {
  candidate: AgentCandidate;
}

/*
 * Candidates aren't signed to MTA yet — they surface from comparables via
 * name normalisation. Distinct dashed border keeps them visually separate
 * from picked agents; primary action is Call, because "sign this agent"
 * is what Sarah does before adding them to a real shortlist.
 */
export function CandidateRow({ candidate }: CandidateRowProps) {
  const tone =
    candidate.confidence === "high"
      ? "chip-success"
      : candidate.confidence === "medium"
      ? "chip-warning"
      : "chip-neutral";

  return (
    <div
      className={cn(
        "flex items-center gap-3 pl-4 pr-2 py-3",
        "border-2 border-dashed rounded-neu bg-surface"
      )}
      style={{ borderColor: "var(--border-strong)" }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="t-body font-semibold truncate">
            {candidate.name}
          </span>
          <span className="t-caption text-text-muted truncate">
            {candidate.agency}
          </span>
        </div>
        <div className="t-caption text-text-muted truncate">
          {candidate.reason_hint}
        </div>
      </div>

      <span className={cn("chip", tone, "shrink-0")}>
        {candidate.confidence}
      </span>

      <a
        href={`tel:${candidate.phone.replace(/\s+/g, "")}`}
        className="shrink-0 h-9 px-3 rounded-neu-sm flex items-center gap-2 t-body font-medium text-on-accent"
        style={{ background: "var(--accent-gradient)" }}
        aria-label={`Call ${candidate.name}`}
      >
        <Phone size={14} />
        Call
      </a>
    </div>
  );
}
