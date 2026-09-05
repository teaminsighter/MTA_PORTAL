"use client";

import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  body?: string;
  onRetry?: () => void;
  action?: ReactNode;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  body = "We couldn't load this section. Try again in a moment.",
  onRetry,
  action,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "neu-inset p-6 flex flex-col items-center justify-center text-center gap-3",
        className
      )}
    >
      <div className="neu-raised-sm h-12 w-12 flex items-center justify-center text-danger">
        <AlertTriangle size={20} />
      </div>
      <div className="t-section">{title}</div>
      <p className="t-body text-text-muted max-w-sm">{body}</p>
      {action ??
        (onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="neu-raised-sm px-4 py-2 t-body font-medium"
          >
            Retry
          </button>
        ) : null)}
    </div>
  );
}
