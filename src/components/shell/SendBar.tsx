"use client";

import { ArrowRight, Check, Clock, Send } from "lucide-react";
import type { SendPhase } from "@/lib/lead/send-flow";
import { cn } from "@/lib/utils";

interface SendBarProps {
  recipientCount: number;
  phase: SendPhase;
  /** How many replies still outstanding — used for the awaiting label. */
  awaitingCount: number;
  /** How many agents have confirmed — used for the vendor CTA count. */
  confirmedCount: number;
  onSend: () => void;
  onSendToVendor: () => void;
}

/*
 * Desktop-only sticky send bar. Fully phase-driven now: the parent
 * owns the fan-out state machine, this component just picks the right
 * label + affordance for each phase.
 *
 *   idle          → "Send to N agents"       (primary; only enabled if N>0)
 *   sending       → "Sending to N…"          (busy, non-interactive)
 *   awaiting      → "Waiting on N replies"   (busy, non-interactive)
 *   ready_vendor  → "Send to Vendor →"       (primary; one-shot pulse)
 *   vendor_sent   → "Vendor packet sent ✓"   (terminal, disabled)
 */
export function SendBar({
  recipientCount,
  phase,
  awaitingCount,
  confirmedCount,
  onSend,
  onSendToVendor,
}: SendBarProps) {
  const visible = recipientCount > 0 || phase !== "idle";
  const busy = phase === "sending" || phase === "awaiting";
  const vendorReady = phase === "ready_vendor";
  const vendorSent = phase === "vendor_sent";

  function handleClick() {
    if (vendorReady) return onSendToVendor();
    if (phase === "idle") return onSend();
  }

  return (
    <div
      className={cn(
        "hidden md:flex sticky bottom-6 justify-end pointer-events-none",
        "transition-[opacity,transform] duration-300",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      )}
      aria-hidden={!visible}
    >
      <div
        className={cn(
          "pointer-events-auto neu-raised px-4 py-3 flex items-center gap-4",
          visible && phase === "idle" && "anim-slide-up"
        )}
      >
        <div className="t-body">
          <div className="text-text-muted t-caption">
            {phase === "idle"
              ? "Recipients"
              : phase === "sending"
                ? "Sending"
                : phase === "awaiting"
                  ? "Awaiting"
                  : phase === "ready_vendor"
                    ? "Confirmed"
                    : "Complete"}
          </div>
          <div className="font-semibold flex items-baseline gap-1">
            <span
              key={phaseCount(phase, recipientCount, awaitingCount, confirmedCount)}
              className="inline-block anim-count-roll tabular"
            >
              {phaseCount(phase, recipientCount, awaitingCount, confirmedCount)}
            </span>
            <span>
              agent
              {phaseCount(phase, recipientCount, awaitingCount, confirmedCount) ===
              1
                ? ""
                : "s"}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleClick}
          className={cn(
            "btn-accent-glass min-w-[192px] justify-center",
            vendorReady && "anim-vendor-pulse"
          )}
          disabled={
            (phase === "idle" && recipientCount === 0) || busy || vendorSent
          }
          aria-busy={busy}
        >
          {phase === "idle" ? (
            <>
              <Send size={16} />
              Send to <span className="tabular">{recipientCount}</span> agent
              {recipientCount === 1 ? "" : "s"}
            </>
          ) : phase === "sending" ? (
            <>
              <Send size={16} className="anim-send-fly" aria-hidden />
              <span className="flex items-center gap-0.5">
                Sending
                <span className="anim-pulse-dot">.</span>
                <span className="anim-pulse-dot anim-pulse-dot-2">.</span>
                <span className="anim-pulse-dot anim-pulse-dot-3">.</span>
              </span>
            </>
          ) : phase === "awaiting" ? (
            <>
              <Clock size={16} className="anim-pulse-soft" aria-hidden />
              Waiting on <span className="tabular">{awaitingCount}</span> repl
              {awaitingCount === 1 ? "y" : "ies"}
            </>
          ) : phase === "ready_vendor" ? (
            <>
              Send to Vendor
              <ArrowRight size={16} aria-hidden />
            </>
          ) : (
            <>
              <Check size={16} className="anim-spring" aria-hidden />
              Vendor packet sent
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function phaseCount(
  phase: SendPhase,
  recipientCount: number,
  awaitingCount: number,
  confirmedCount: number
): number {
  if (phase === "idle") return recipientCount;
  if (phase === "awaiting") return awaitingCount;
  if (phase === "ready_vendor" || phase === "vendor_sent") return confirmedCount;
  return recipientCount;
}

