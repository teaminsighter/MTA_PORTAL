"use client";

import { useRef, useState } from "react";
import { Check, Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface SendBarProps {
  recipientCount: number;
  onSend?: () => void;
}

type SendState = "idle" | "sending" | "sent";

/*
 * Desktop-only sticky send bar. Slides up from below on the first pick;
 * fades out when the count returns to zero. The recipient number itself
 * animates with a count-roll each time it changes (keyed by count).
 *
 * On click: the paper-plane icon lifts off (anim-send-fly), the label
 * flips to "Sending…" with pulsing dots for ~1.4s, then a "Sent ✓"
 * confirmation flashes before the button returns to idle. Demo-safe —
 * onSend is called immediately, the animation is purely feedback.
 */
export function SendBar({ recipientCount, onSend }: SendBarProps) {
  const visible = recipientCount > 0;
  const [state, setState] = useState<SendState>("idle");
  const timer = useRef<number | null>(null);

  function handleSend() {
    if (state !== "idle" || !visible) return;
    onSend?.();
    setState("sending");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setState("sent");
      timer.current = window.setTimeout(() => {
        setState("idle");
      }, 1600);
    }, 1400);
  }

  const busy = state !== "idle";

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
          visible && "anim-slide-up"
        )}
      >
        <div className="t-body">
          <div className="text-text-muted t-caption">Recipients</div>
          <div className="font-semibold flex items-baseline gap-1">
            <span
              key={recipientCount}
              className="inline-block anim-count-roll tabular"
            >
              {recipientCount}
            </span>
            <span>agent{recipientCount === 1 ? "" : "s"}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSend}
          className="btn-accent-glass min-w-[168px] justify-center"
          disabled={!visible || busy}
          aria-busy={busy}
        >
          {state === "idle" ? (
            <>
              <Send size={16} />
              Send to <span className="tabular">{recipientCount}</span> agent
              {recipientCount === 1 ? "" : "s"}
            </>
          ) : state === "sending" ? (
            <>
              <Send size={16} className="anim-send-fly" aria-hidden />
              <span className="flex items-center gap-0.5">
                Sending
                <span className="anim-pulse-dot">.</span>
                <span className="anim-pulse-dot anim-pulse-dot-2">.</span>
                <span className="anim-pulse-dot anim-pulse-dot-3">.</span>
              </span>
            </>
          ) : (
            <>
              <Check size={16} className="anim-spring" aria-hidden />
              Sent
            </>
          )}
        </button>
      </div>
    </div>
  );
}
