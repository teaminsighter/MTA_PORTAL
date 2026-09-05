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

interface TimelineProps {
  events: ActivityEvent[];
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

export function Timeline({ events }: TimelineProps) {
  return (
    <div className="surface-flat overflow-hidden">
      <div className="px-4 py-2 t-caption text-text-subtle uppercase tracking-wide border-b">
        Timeline
      </div>
      <ol className="max-h-[420px] overflow-y-auto divide-y">
        {events.map((e, i) => {
          const Icon = ICONS[e.type];
          return (
            <li key={i} className="flex items-start gap-3 px-4 py-3">
              <div className="mt-0.5 h-8 w-8 flex items-center justify-center rounded-neu-sm neu-raised-sm text-text-muted">
                <Icon size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="t-body">{e.detail}</div>
                <div className="t-caption text-text-subtle tabular">
                  {formatRelative(e.at)}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
