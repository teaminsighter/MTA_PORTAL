"use client";

import { useState } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  CheckCircle2,
  Eye,
  Inbox,
  Send,
  Sparkles,
} from "lucide-react";
import type { ActivityEvent, ActivityType } from "@/lib/mock";
import { formatRelative } from "@/lib/utils";

interface CompactTimelineProps {
  events: ActivityEvent[];
  /**
   * Number of events to show before the "view all" toggle. Default 4.
   */
  initialCount?: number;
}

const ICONS: Record<ActivityType, typeof Inbox> = {
  lead_received: Inbox,
  enrichment_done: Sparkles,
  ac_sync_out: ArrowUpCircle,
  ac_sync_in: ArrowDownCircle,
  send: Send,
  delivery: CheckCircle2,
  state_change: CheckCircle2,
  vendor_open: Eye,
};

export function CompactTimeline({
  events,
  initialCount = 4,
}: CompactTimelineProps) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? events : events.slice(0, initialCount);
  const hasMore = events.length > initialCount;

  return (
    <div className="surface-flat flex flex-col">
      <div className="px-4 py-2 flex items-center justify-between border-b">
        <span className="t-caption text-text-subtle uppercase tracking-wide">
          Timeline
        </span>
        <span className="t-caption text-text-muted tabular">
          {events.length}
        </span>
      </div>
      <ol className="divide-y">
        {visible.map((e, i) => {
          const Icon = ICONS[e.type] ?? CheckCircle2;
          return (
            <li key={i} className="flex items-start gap-3 px-4 py-2.5">
              <div className="mt-0.5 h-7 w-7 rounded-neu-sm neu-raised-sm flex items-center justify-center text-text-muted shrink-0">
                <Icon size={12} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="t-body truncate">{e.detail}</div>
                <div className="t-caption text-text-subtle tabular">
                  {formatRelative(e.at)}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
      {hasMore ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="border-t px-4 py-2 t-caption text-accent font-medium text-center hover:bg-surface-elevated transition-colors"
        >
          {showAll ? "Show less" : `View all ${events.length}`}
        </button>
      ) : null}
    </div>
  );
}
