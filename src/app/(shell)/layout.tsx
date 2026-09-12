import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";

/*
 * Shell chrome.
 *
 * Desktop: sidebar sits in the page flow (sticky column) at 64px and
 *   hover-expands to 240px. Main content shrinks alongside via the
 *   flex layout so tables etc. reflow — no content sits underneath
 *   the expanded rail.
 * Mobile: sidebar hidden in-flow, rendered as a fixed pill at the
 *   bottom (icons only) so the primary action area up top is free.
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:flex">
      {/* Desktop sidebar — in-flow, shrinks main content on expand.
          The aside mirrors the nav's width transition (via :has()) so
          the main column reflows in lockstep with the rail animation
          rather than waiting for the intrinsic size to catch up. */}
      <aside
        className={
          "hidden lg:block sticky top-0 h-screen p-4 shrink-0 " +
          // Aside width mirrors nav's own w-16 → w-60 (+ 2rem padding).
          // has-[nav:hover] so hover-empty padding doesn't trigger it —
          // stays in lockstep with the sidebar's group-hover label
          // reveal.
          "lg:w-24 lg:has-[nav:hover]:w-[17rem] " +
          "lg:transition-[width] lg:duration-200 lg:ease-out"
        }
      >
        <Sidebar />
      </aside>

      <div className="flex-1 min-w-0 flex flex-col min-h-screen">
        <div className="p-4 pb-0 lg:pl-0">
          <Topbar />
        </div>
        <main className="flex-1 p-4 pb-28 lg:pb-4 lg:pl-0">{children}</main>

        {/* Mobile bottom nav (icons only) */}
        <div className="lg:hidden fixed bottom-4 left-4 right-4 z-10 pointer-events-none">
          <div className="pointer-events-auto">
            <Sidebar />
          </div>
        </div>
      </div>
    </div>
  );
}
