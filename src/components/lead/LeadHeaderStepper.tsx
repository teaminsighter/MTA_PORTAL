import type { LeadState } from "@/lib/mock";
import { cn } from "@/lib/utils";

/*
 * Five canonical stages of a lead's lifecycle. All ten LeadState values
 * collapse into one of these steps. Errors (partial_send) flag the current
 * step as danger without changing which step is current.
 */
const STEPS = [
  { key: "received", label: "Received" },
  { key: "enriched", label: "Enriched" },
  { key: "review", label: "Review" },
  { key: "sent", label: "Sent" },
  { key: "responses", label: "Responses" },
] as const;

type StepIndex = 0 | 1 | 2 | 3 | 4;

/*
 * Maps the fine-grained lead.state to a stepper position.
 *   completedIdx: last step whose work is done
 *   currentIdx:   step in progress (may equal completedIdx+1 when moving on)
 *   error:        current step failed (partial_send)
 */
function project(state: LeadState): {
  completedIdx: number;
  currentIdx: number;
  error: boolean;
} {
  switch (state) {
    case "empty_workspace":
      return { completedIdx: -1, currentIdx: 0, error: false };
    case "received":
      return { completedIdx: 0, currentIdx: 1, error: false };
    case "enriching":
      return { completedIdx: 0, currentIdx: 1, error: false };
    case "ready_for_review":
      return { completedIdx: 1, currentIdx: 2, error: false };
    case "dispatching":
      return { completedIdx: 2, currentIdx: 3, error: false };
    case "partial_send":
      return { completedIdx: 2, currentIdx: 3, error: true };
    case "sent":
      return { completedIdx: 3, currentIdx: 4, error: false };
    case "awaiting_agent_responses":
      return { completedIdx: 3, currentIdx: 4, error: false };
    case "agent_appointed":
    case "listed":
    case "sold":
      return { completedIdx: 4, currentIdx: 4, error: false };
  }
}

interface LeadHeaderStepperProps {
  state: LeadState;
  className?: string;
}

/*
 * Desktop: horizontal 5-step stepper with connector rails.
 * Mobile: compact progress bar with the current step label underneath.
 * The two views are rendered together and toggled by breakpoint so the
 * DOM stays small and skeletons don't have to swap layouts.
 */
export function LeadHeaderStepper({ state, className }: LeadHeaderStepperProps) {
  const { completedIdx, currentIdx, error } = project(state);
  const totalSteps = STEPS.length;
  const currentLabel = STEPS[currentIdx as StepIndex]?.label ?? "—";
  const percent = Math.max(
    0,
    Math.min(100, ((completedIdx + 1) / totalSteps) * 100)
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {/* ---------- Desktop stepper ---------- */}
      <ol
        aria-label="Lead progress"
        className="hidden md:flex items-center gap-2"
      >
        {STEPS.map((step, i) => {
          const isDone = i <= completedIdx;
          const isCurrent = i === currentIdx && !isDone;
          const isError = isCurrent && error;
          const isLast = i === totalSteps - 1;

          return (
            <li
              key={step.key}
              className="flex-1 flex items-center gap-2 min-w-0"
              aria-current={isCurrent ? "step" : undefined}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={cn(
                    "h-7 w-7 shrink-0 rounded-neu-pill flex items-center justify-center t-caption font-semibold transition-colors",
                    isDone && "text-on-accent",
                    !isDone && !isCurrent && "neu-inset-sm text-text-subtle",
                    isCurrent && !isError && "neu-raised-sm text-accent",
                    isError && "text-on-accent"
                  )}
                  style={{
                    background: isDone
                      ? "var(--accent-gradient)"
                      : isError
                      ? "var(--danger)"
                      : undefined,
                  }}
                  aria-hidden
                >
                  {isDone ? "✓" : i + 1}
                </span>
                <span
                  className={cn(
                    "t-body truncate",
                    isDone && "text-text",
                    isCurrent && !isError && "text-text font-semibold",
                    isError && "text-danger font-semibold",
                    !isDone && !isCurrent && "text-text-muted"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {isLast ? null : (
                <span
                  aria-hidden
                  className={cn(
                    "flex-1 h-[2px] rounded-neu-pill transition-colors",
                    i < completedIdx
                      ? "bg-accent"
                      : "bg-[color:var(--border)]"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* ---------- Mobile progress bar ---------- */}
      <div className="md:hidden flex flex-col gap-1">
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={totalSteps}
          aria-valuenow={completedIdx + 1}
          aria-label={`Progress: ${currentLabel}`}
          className="neu-inset-sm h-2 overflow-hidden"
        >
          <div
            className="h-full rounded-neu-pill transition-[width] duration-300"
            style={{
              width: `${percent}%`,
              background: error
                ? "var(--danger)"
                : "var(--accent-gradient)",
            }}
          />
        </div>
        <div className="flex items-center justify-between t-caption">
          <span
            className={cn(
              "font-semibold",
              error ? "text-danger" : "text-text"
            )}
          >
            {currentLabel}
          </span>
          <span className="text-text-muted tabular">
            Step {Math.min(currentIdx + 1, totalSteps)} of {totalSteps}
          </span>
        </div>
      </div>
    </div>
  );
}
