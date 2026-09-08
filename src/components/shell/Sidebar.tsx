"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Inbox, LayoutGrid, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  countUnread,
  useInbox,
  useLastSeenAt,
} from "@/lib/inbox/use-inbox";

const NAV = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/leads/MTA-2026-00421", label: "Leads", icon: LayoutGrid },
  { href: "/admin", label: "Admin", icon: ShieldCheck },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const inbox = useInbox();
  const lastSeen = useLastSeenAt();
  const unread = inbox.data ? countUnread(inbox.data.leads, lastSeen) : 0;

  return (
    <nav
      aria-label="Primary"
      className="neu-raised h-full flex lg:flex-col flex-row items-center lg:items-stretch gap-2 lg:gap-3 p-3 lg:p-4 lg:w-56 w-full"
    >
      <div className="hidden lg:flex items-center gap-2 pb-4">
        <div className="neu-raised-sm h-9 w-9 flex items-center justify-center">
          <span className="accent-text font-bold t-default">M</span>
        </div>
        <span className="accent-text font-bold t-section">MTA</span>
      </div>

      {NAV.map(({ href, label, icon: Icon }) => {
        const active =
          href === pathname ||
          (href.startsWith("/leads") && pathname.startsWith("/leads"));
        const showBadge = label === "Inbox" && unread > 0;
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-neu-sm px-3 py-2 t-body font-medium transition-colors flex-1 lg:flex-none relative",
              active
                ? "neu-inset-sm text-accent"
                : "text-text-muted hover:text-text"
            )}
          >
            <span className="relative inline-flex">
              <Icon size={18} />
              {showBadge ? (
                <span
                  aria-hidden
                  className="lg:hidden absolute -top-1 -right-1 h-2 w-2 rounded-neu-pill bg-accent"
                />
              ) : null}
            </span>
            <span className="hidden lg:inline">{label}</span>
            {showBadge ? (
              <span
                className="hidden lg:inline-flex ml-auto items-center justify-center min-w-5 px-1.5 h-5 rounded-neu-pill t-caption font-semibold text-on-accent tabular"
                style={{ background: "var(--accent-gradient)" }}
                aria-label={`${unread} unread`}
              >
                {unread}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
