import { cn } from "@/lib/utils";

interface LoadingSkeletonProps {
  className?: string;
  rows?: number;
  label?: string;
}

/**
 * Neumorphic inset skeleton block. Use for any data region while loading.
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
        <div
          key={i}
          className="h-3 rounded-neu-sm animate-pulse"
          style={{
            width: `${60 + ((i * 13) % 35)}%`,
            background:
              "linear-gradient(90deg, var(--surface-inset), var(--border), var(--surface-inset))",
            backgroundSize: "200% 100%",
          }}
        />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}
