import type { ReactNode } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "neu-inset p-8 flex flex-col items-center justify-center text-center gap-3",
        className
      )}
    >
      <div className="neu-raised-sm h-12 w-12 flex items-center justify-center text-text-muted">
        {icon ?? <Inbox size={20} />}
      </div>
      <div className="t-section">{title}</div>
      {body ? (
        <p className="t-body text-text-muted max-w-sm">{body}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
