import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";

export default function ShellLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      {/* Sidebar: left on desktop, hidden on mobile (mobile uses BottomActionBar per screen) */}
      <aside className="hidden lg:block p-4">
        <Sidebar />
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
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
