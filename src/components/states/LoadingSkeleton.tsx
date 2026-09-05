import { cn } from "@/lib/utils";

interface LoadingSkeletonProps {
  className?: string;
  rows?: number;
  label?: string;
}

/*
 * Generic neumorphic-inset skeleton. Prefer the layout-matched
 * <PropertyHeroSkeleton />, <ShortlistSkeleton /> or <TimelineSkeleton />
 * for real data regions — they mirror the final component so there's no
 * layout shift when data lands.
 */
export function LoadingSkeleton({
  className,
  rows = 3,
  label = "Loading",
}: LoadingSkeletonProps) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn("neu-inset p-4 space-y-3", className)}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonBar key={i} width={`${60 + ((i * 13) % 35)}%`} />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/**
 * Layout-matched skeleton for the property hero band.
 * Renders two big value blocks and a compact spec line, same as
 * <PropertyHero />.
 */
export function PropertyHeroSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading property"
      className="neu-raised p-6 flex flex-col gap-4"
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <div className="flex flex-col gap-2">
          <SkeletonBar width="45%" height="10px" />
          <SkeletonBar width="80%" height="28px" />
        </div>
        <SkeletonBar width="42px" height="20px" className="rounded-neu-pill" />
        <div className="flex flex-col gap-2 items-end">
          <SkeletonBar width="45%" height="10px" />
          <SkeletonBar width="80%" height="28px" />
        </div>
      </div>
      <SkeletonBar width="90%" />
    </div>
  );
}

/**
 * Layout-matched skeleton for the shortlist. Renders N collapsed rows
 * with header height matching <AgentRow /> at ~56px each.
 */
export function ShortlistSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading shortlist"
      className="flex flex-col gap-2"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="neu-raised-sm h-14 flex items-center gap-3 px-4"
        >
          <div className="flex-1 flex flex-col gap-1">
            <SkeletonBar width="45%" />
            <SkeletonBar width="30%" height="10px" />
          </div>
          <SkeletonBar width="80px" height="20px" className="rounded-neu-pill" />
          <SkeletonBar width="32px" height="32px" className="rounded-neu-sm" />
        </div>
      ))}
    </div>
  );
}

/**
 * Layout-matched skeleton for the compact timeline.
 */
export function TimelineSkeleton() {
  return (
    <div
      role="status"
      aria-label="Loading timeline"
      className="surface-flat divide-y"
    >
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 px-4 py-2.5">
          <div className="h-7 w-7 rounded-neu-sm neu-raised-sm shrink-0" />
          <div className="flex-1 flex flex-col gap-1">
            <SkeletonBar width={`${55 + ((i * 11) % 30)}%`} />
            <SkeletonBar width="25%" height="10px" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Internals                                                          */
/* ------------------------------------------------------------------ */

interface SkeletonBarProps {
  width: string;
  height?: string;
  className?: string;
}

function SkeletonBar({ width, height = "14px", className }: SkeletonBarProps) {
  return (
    <div
      aria-hidden
      className={cn("rounded-neu-sm animate-pulse", className)}
      style={{
        width,
        height,
        background:
          "linear-gradient(90deg, var(--surface-inset), var(--border), var(--surface-inset))",
        backgroundSize: "200% 100%",
      }}
    />
  );
}
