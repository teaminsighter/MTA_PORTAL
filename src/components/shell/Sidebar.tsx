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

/*
 * Sidebar.
 *
 * Desktop: rest state is a 64px icon column with icons centred; on
 *   hover the whole nav expands to 240px, revealing the brand
 *   wordmark, labels, and the accent-gradient unread pill. Labels
 *   are display:none while collapsed (not just opacity-0) so they
 *   don't take up flex space and the icons sit dead-centre.
 * Mobile: rendered inside a bottom-fixed pill by the shell layout;
 *   collapsed styling doesn't apply because we're never in `group`
 *   scope on mobile (the .group class is lg-only via the width
 *   transition wrappers).
 */
export function Sidebar() {
  const pathname = usePathname();
  const inbox = useInbox();
  const lastSeen = useLastSeenAt();
  const unread = inbox.data ? countUnread(inbox.data.leads, lastSeen) : 0;

  return (
    <nav
      aria-label="Primary"
      className={cn(
        "neu-raised h-full flex lg:flex-col flex-row items-center lg:items-stretch gap-2 lg:gap-3 p-3 lg:p-4 w-full",
        // Desktop collapsed → hover-expanded.
        "group lg:w-16 lg:hover:w-60 lg:transition-[width] lg:duration-200 lg:ease-out",
        "lg:overflow-hidden"
      )}
    >
      {/* Brand mark. Icon always centred while collapsed; wordmark
          appears + row left-aligns on hover. */}
      <div
        className={cn(
          "hidden lg:flex items-center gap-2 pb-4 min-w-0",
          "justify-center group-hover:justify-start"
        )}
      >
        <div className="neu-raised-sm h-9 w-9 flex items-center justify-center shrink-0">
          <span className="accent-text font-bold t-default">M</span>
        </div>
        <span
          className={cn(
            "accent-text font-bold t-section whitespace-nowrap",
            // Truly hidden while collapsed so it doesn't push the M
            // off-centre.
            "hidden group-hover:inline"
          )}
        >
          MTA
        </span>
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
              "flex items-center gap-3 rounded-neu-sm px-3 py-2 t-body font-medium transition-colors flex-1 lg:flex-none relative min-w-0",
              // Centre the icon while collapsed; align-start once
              // the label appears on hover.
              "lg:justify-center lg:group-hover:justify-start",
              active
                ? "neu-inset-sm text-accent"
                : "text-text-muted hover:text-text"
            )}
            aria-label={label}
            title={label}
          >
            <span className="relative inline-flex shrink-0">
              <Icon size={18} />
              {/* Icon-only unread dot — visible while sidebar is
                  collapsed on desktop or in mobile bottom bar. */}
              {showBadge ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute -top-1 -right-1 h-2 w-2 rounded-neu-pill bg-accent",
                    // Hide the dot once the count pill shows up on
                    // hover.
                    "lg:group-hover:hidden"
                  )}
                />
              ) : null}
            </span>
            <span
              className={cn(
                "whitespace-nowrap",
                // Fully hidden while collapsed so the icon centres
                // properly, then reappears on hover.
                "hidden lg:group-hover:inline"
              )}
            >
              {label}
            </span>
            {showBadge ? (
              <span
                className={cn(
                  "ml-auto items-center justify-center min-w-5 px-1.5 h-5 rounded-neu-pill t-caption font-semibold text-on-accent tabular",
                  "hidden lg:group-hover:inline-flex"
                )}
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
