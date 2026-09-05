"use client";

import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface SendBarProps {
  recipientCount: number;
  onSend?: () => void;
}

/*
 * Desktop-only sticky send bar. Slides up from below on the first pick;
 * fades out when the count returns to zero. The recipient number itself
 * animates with a count-roll each time it changes (keyed by count).
 */
export function SendBar({ recipientCount, onSend }: SendBarProps) {
  const visible = recipientCount > 0;

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
          onClick={onSend}
          className="btn-accent-glass"
          disabled={!visible}
        >
          <Send size={16} />
          Send to <span className="tabular">{recipientCount}</span> agent
          {recipientCount === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
