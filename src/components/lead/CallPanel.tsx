"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Phone, PhoneOff, RotateCcw, X } from "lucide-react";
import type { Agent, AgentCandidate } from "@/lib/mock";
import { cn } from "@/lib/utils";

type CallSubject = Agent | AgentCandidate;

interface CallPanelProps {
  open: boolean;
  subject: CallSubject | null;
  onClose: () => void;
  /** "Confirmed on this lead" — flips row to green tick. */
  onConfirm: (subjectId: string) => void;
  /** "Not interested" — flips row to Declined. */
  onDecline: (subjectId: string) => void;
}

type CallStage = "dialing" | "connecting" | "on_call" | "ended";

/*
 * Animated call panel. Slides up from the bottom-right, sits over the
 * shortlist without obscuring the property column.
 *
 * Timing: dialing 900ms → connecting 900ms → on_call (Sarah controls
 * "End call") → ended (outcome buttons). Sarah picks Confirmed /
 * Declined / No answer and the parent updates the row status. Real
 * PSTN wiring would replace the timers with events from a WebRTC
 * bridge or Twilio-style hook; the outcome UI stays the same.
 */
export function CallPanel({
  open,
  subject,
  onClose,
  onConfirm,
  onDecline,
}: CallPanelProps) {
  const [stage, setStage] = useState<CallStage>("dialing");
  const [elapsed, setElapsed] = useState(0);
  const timers = useRef<number[]>([]);
  const tick = useRef<number | null>(null);

  useEffect(() => {
    if (!open || !subject) return;
    // Reset on every open so re-calling the same agent starts fresh.
    setStage("dialing");
    setElapsed(0);
    const t1 = window.setTimeout(() => setStage("connecting"), 900);
    const t2 = window.setTimeout(() => {
      setStage("on_call");
      // Start the call timer once "connected".
      tick.current = window.setInterval(() => {
        setElapsed((e) => e + 1);
      }, 1000);
    }, 1800);
    timers.current.push(t1, t2);
    return () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
      if (tick.current) window.clearInterval(tick.current);
      tick.current = null;
    };
  }, [open, subject]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function endCall() {
    if (tick.current) window.clearInterval(tick.current);
    tick.current = null;
    setStage("ended");
  }

  function redial() {
    setStage("dialing");
    setElapsed(0);
    const t1 = window.setTimeout(() => setStage("connecting"), 900);
    const t2 = window.setTimeout(() => {
      setStage("on_call");
      tick.current = window.setInterval(() => {
        setElapsed((e) => e + 1);
      }, 1000);
    }, 1800);
    timers.current.push(t1, t2);
  }

  if (!open || !subject) return null;

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="call-panel-title"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
    >
      <button
        type="button"
        aria-label="Close call panel"
        onClick={onClose}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm anim-fade-in"
      />

      <div className="relative neu-raised w-full max-w-md p-6 flex flex-col gap-5 anim-modal-in">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-3 top-3 h-8 w-8 rounded-neu-sm flex items-center justify-center text-text-muted hover:text-text hover:bg-neutral-bg"
        >
          <X size={16} />
        </button>

        {/* -------- Avatar + ring animation -------- */}
        <div className="flex flex-col items-center gap-3">
          <div
            className={cn(
              "relative h-24 w-24 rounded-neu-pill flex items-center justify-center",
              (stage === "dialing" || stage === "connecting") &&
                "anim-call-ring",
              stage === "on_call" && "anim-call-active"
            )}
            style={{
              background:
                stage === "ended"
                  ? "var(--neutral-bg)"
                  : "var(--accent-gradient)",
              color: stage === "ended" ? "var(--text-muted)" : "var(--on-accent)",
            }}
          >
            {stage === "ended" ? (
              <PhoneOff size={36} aria-hidden />
            ) : (
              <Phone
                size={36}
                aria-hidden
                className={cn(stage === "dialing" && "anim-phone-wiggle")}
              />
            )}
          </div>

          <div className="text-center">
            <h2 id="call-panel-title" className="t-section leading-tight">
              {subject.name}
            </h2>
            <div className="t-body text-text-muted">{subject.agency}</div>
            <div className="t-caption text-text-muted tabular mt-1">
              {subject.phone}
            </div>
          </div>

          <div className="min-h-[24px] flex items-center gap-2 t-body text-text-muted">
            {stage === "dialing" ? (
              <>
                <span>Dialing</span>
                <span className="anim-pulse-dot">.</span>
                <span className="anim-pulse-dot anim-pulse-dot-2">.</span>
                <span className="anim-pulse-dot anim-pulse-dot-3">.</span>
              </>
            ) : stage === "connecting" ? (
              <>
                <span>Connecting</span>
                <span className="anim-pulse-dot">.</span>
                <span className="anim-pulse-dot anim-pulse-dot-2">.</span>
                <span className="anim-pulse-dot anim-pulse-dot-3">.</span>
              </>
            ) : stage === "on_call" ? (
              <>
                <span
                  className="h-2 w-2 rounded-neu-pill"
                  style={{ background: "var(--success)" }}
                />
                <span>
                  On call ·{" "}
                  <span className="tabular text-text font-medium">
                    {mm}:{ss}
                  </span>
                </span>
              </>
            ) : (
              <span>
                Call ended ·{" "}
                <span className="tabular text-text font-medium">
                  {mm}:{ss}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* -------- Primary control (end call) OR outcome buttons -------- */}
        {stage !== "ended" ? (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={endCall}
              className="h-12 px-6 rounded-neu-pill flex items-center gap-2 text-on-accent font-semibold shadow-raised-sm"
              style={{ background: "var(--danger)" }}
            >
              <PhoneOff size={16} aria-hidden />
              End call
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div className="t-caption text-text-muted text-center">
              How did it go?
            </div>
            <button
              type="button"
              onClick={() => {
                onConfirm(subject.id);
                onClose();
              }}
              className="h-11 rounded-neu-sm flex items-center justify-center gap-2 text-on-accent font-semibold"
              style={{ background: "var(--success)" }}
            >
              <Check size={16} aria-hidden />
              Confirmed — they&rsquo;re in
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onDecline(subject.id);
                  onClose();
                }}
                className="h-10 neu-raised-sm rounded-neu-sm flex items-center justify-center gap-2 t-body text-text"
              >
                <X size={14} aria-hidden />
                Not interested
              </button>
              <button
                type="button"
                onClick={redial}
                className="h-10 neu-raised-sm rounded-neu-sm flex items-center justify-center gap-2 t-body text-text-muted"
              >
                <RotateCcw size={14} aria-hidden />
                Try again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
