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
 * Desktop: rest state is a 64px icon column; on hover the whole nav
 *   expands to 240px, revealing the brand mark + labels + count
 *   badge. Transition is width-only so the icons don't jump. The
 *   parent layout reserves 64px of left padding so main content
 *   doesn't reflow when the sidebar overlays it.
 * Mobile: rendered inside a bottom-fixed pill by the shell layout;
 *   collapsed styling doesn't apply because we're never in `group`
 *   scope there.
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
      {/* Brand mark. Icon always visible; wordmark fades in on hover. */}
      <div className="hidden lg:flex items-center gap-2 pb-4 min-w-0">
        <div className="neu-raised-sm h-9 w-9 flex items-center justify-center shrink-0">
          <span className="accent-text font-bold t-default">M</span>
        </div>
        <span
          className={cn(
            "accent-text font-bold t-section whitespace-nowrap",
            "opacity-0 group-hover:opacity-100 transition-opacity duration-150"
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
              active
                ? "neu-inset-sm text-accent"
                : "text-text-muted hover:text-text"
            )}
            aria-label={label}
            title={label}
          >
            <span className="relative inline-flex shrink-0">
              <Icon size={18} />
              {/* Icon-only unread dot — visible while sidebar is collapsed
                  on desktop or in mobile bottom bar. */}
              {showBadge ? (
                <span
                  aria-hidden
                  className={cn(
                    "absolute -top-1 -right-1 h-2 w-2 rounded-neu-pill bg-accent",
                    // Hide the dot while the sidebar is expanded on
                    // desktop (the pill count replaces it).
                    "lg:group-hover:hidden"
                  )}
                />
              ) : null}
            </span>
            <span
              className={cn(
                "whitespace-nowrap",
                "hidden lg:inline",
                "lg:opacity-0 lg:group-hover:opacity-100 lg:transition-opacity lg:duration-150"
              )}
            >
              {label}
            </span>
            {showBadge ? (
              <span
                className={cn(
                  "hidden lg:inline-flex ml-auto items-center justify-center min-w-5 px-1.5 h-5 rounded-neu-pill t-caption font-semibold text-on-accent tabular",
                  // Only reveal the pill count once expanded; the icon
                  // dot handles collapsed state.
                  "lg:opacity-0 lg:group-hover:opacity-100 lg:transition-opacity lg:duration-150"
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
