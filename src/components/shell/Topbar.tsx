import { Search } from "lucide-react";

export function Topbar() {
  return (
    <header className="neu-raised px-4 py-3 flex items-center gap-4 sticky top-0 z-10">
      <div className="lg:hidden flex items-center gap-2">
        <div className="neu-raised-sm h-8 w-8 flex items-center justify-center">
          <span className="accent-text font-bold t-body">M</span>
        </div>
        <span className="accent-text font-bold t-default">MTA</span>
      </div>

      <div className="flex-1 max-w-xl">
        <label className="relative block">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle pointer-events-none"
          />
          <input
            type="search"
            placeholder="Search leads, vendors, agents…"
            className="neu-input pl-9"
            aria-label="Search"
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <div className="neu-raised-sm flex items-center gap-2 pl-1 pr-1 sm:pr-3 py-1">
          <div className="h-7 w-7 rounded-neu-pill flex items-center justify-center text-on-accent font-semibold t-caption bg-accent">
            SW
          </div>
          <span className="hidden sm:inline t-caption text-text-muted">
            Sarah W.
          </span>
        </div>
      </div>
    </header>
  );
}
