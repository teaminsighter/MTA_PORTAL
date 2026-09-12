import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";

/*
 * Shell chrome.
 *
 * Desktop: sidebar is a fixed 64px icon column that expands to 240px
 *   on hover (via .group + group-hover on the Sidebar itself). Main
 *   content reserves a 64px left padding so nothing reflows when the
 *   sidebar expands — it overlays. Feels like VS Code / Notion.
 * Mobile: sidebar hidden in-flow, rendered as a fixed pill at the
 *   bottom (icons only) so the primary action area up top is free.
 */
export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      {/* Desktop sidebar — fixed, overlays main on hover-expand */}
      <div className="hidden lg:block fixed inset-y-0 left-0 z-20 p-4">
        <Sidebar />
      </div>

      <div className="flex flex-col min-h-screen lg:pl-24">
        <div className="p-4 pb-0">
          <Topbar />
        </div>
        <main className="flex-1 p-4 pb-28 lg:pb-4">{children}</main>

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
