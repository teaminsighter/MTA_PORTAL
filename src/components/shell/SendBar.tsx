"use client";

import { Send } from "lucide-react";

interface SendBarProps {
  recipientCount: number;
  onSend?: () => void;
}

/**
 * Desktop-only sticky send bar. Pins bottom-right of the workspace column.
 */
export function SendBar({ recipientCount, onSend }: SendBarProps) {
  const disabled = recipientCount === 0;
  return (
    <div className="hidden md:flex sticky bottom-6 justify-end pointer-events-none">
      <div className="pointer-events-auto neu-raised px-4 py-3 flex items-center gap-4">
        <div className="t-body">
          <div className="text-text-muted t-caption">Recipients</div>
          <div className="font-semibold tabular">
            {recipientCount} agent{recipientCount === 1 ? "" : "s"}
          </div>
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={onSend}
          className="btn-accent-glass"
        >
          <Send size={16} />
          Send to {recipientCount} agent{recipientCount === 1 ? "" : "s"}
        </button>
      </div>
    </div>
  );
}
