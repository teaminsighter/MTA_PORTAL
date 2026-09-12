import Image from "next/image";
import Link from "next/link";
import { Eye, Search } from "lucide-react";
import { isDemoMode } from "@/lib/demo/mode";

export function Topbar() {
  const demo = isDemoMode();

  return (
    <header className="neu-raised px-4 py-3 flex items-center gap-4 sticky top-0 z-10">
      {/* Brand — full horizontal logo, always visible. Lives on the
          topbar (not the sidebar) so it stays legible when the nav
          rail collapses to icons. */}
      <Link
        href="/inbox"
        aria-label="My Top Agent — home"
        className="relative h-9 w-28 sm:w-36 shrink-0 block"
      >
        <Image
          src="/logo-mta.png"
          alt="My Top Agent"
          fill
          priority
          sizes="(min-width: 640px) 144px, 112px"
          className="object-contain object-left"
        />
      </Link>

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
        {demo ? (
          <span
            className="chip chip-warning t-caption flex items-center gap-1"
            aria-label="Demo mode — no real data, changes don't persist"
          >
            <Eye size={11} />
            Demo mode
          </span>
        ) : null}
        <div className="neu-raised-sm flex items-center gap-2 pl-1 pr-1 sm:pr-3 py-1">
          <div className="h-7 w-7 rounded-neu-pill flex items-center justify-center text-on-accent font-semibold t-caption bg-accent">
            {demo ? "D" : "SW"}
          </div>
          <span className="hidden sm:inline t-caption text-text-muted">
            {demo ? "Demo viewer" : "Sarah W."}
          </span>
        </div>
      </div>
    </header>
  );
}
