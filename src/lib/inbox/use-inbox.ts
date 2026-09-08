"use client";

import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import type { InboxResponse } from "@/app/api/inbox/route";

/*
 * Inbox polling contract.
 *
 * One shared query key so the Sidebar badge and the InboxClient
 * consume the same in-flight fetch — no duplicate polling. Poll
 * cadence and window-focus refetch match §2 (§10 point 5: polling +
 * refetch on focus, no SSE).
 *
 * lastSeen is a client-only concept: the ISO timestamp the current
 * user most recently viewed the inbox. Anything created after that
 * counts as "unread" and gets a dot on its card + the sidebar badge.
 * Kept in localStorage so it survives a reload but doesn't leak
 * across users (the browser session already scopes that).
 */

export const INBOX_POLL_INTERVAL_MS = 15_000;

export function useInbox(initialData?: InboxResponse) {
  return useQuery<InboxResponse>({
    queryKey: ["inbox"],
    queryFn: async () => {
      const res = await fetch("/api/inbox", { cache: "no-store" });
      if (!res.ok) throw new Error(`inbox fetch failed: ${res.status}`);
      return res.json();
    },
    refetchInterval: INBOX_POLL_INTERVAL_MS,
    refetchOnWindowFocus: true,
    initialData,
  });
}

/* ---------------- last-seen (client, localStorage) ---------------- */

const LAST_SEEN_KEY = "mta.lastSeenInboxAt";
const LAST_SEEN_EVENT = "mta:inbox-seen";

function getLastSeenSnapshot(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(LAST_SEEN_KEY) ?? "";
}

function subscribeLastSeen(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener("storage", handler);
  window.addEventListener(LAST_SEEN_EVENT, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(LAST_SEEN_EVENT, handler);
  };
}

/**
 * Reactive read of the current "last seen inbox" timestamp. Empty
 * string on the server (SSR) and on first client render before the
 * hook subscribes, which means "seen never" → every lead is unread
 * until the user opens the inbox at least once.
 */
export function useLastSeenAt(): string {
  return useSyncExternalStore(
    subscribeLastSeen,
    getLastSeenSnapshot,
    () => ""
  );
}

/**
 * Called by <InboxClient/> on mount and whenever a user re-focuses
 * the tab while on the inbox. Broadcasts a same-tab event so the
 * Sidebar badge and any other subscribers refresh immediately —
 * `storage` events only fire in *other* tabs.
 */
export function markInboxSeen(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
  window.dispatchEvent(new Event(LAST_SEEN_EVENT));
}

/** Count of leads created after the user's last inbox visit. */
export function countUnread(
  leads: { created_at: string }[],
  lastSeenAt: string
): number {
  if (!lastSeenAt) return leads.length;
  return leads.filter((l) => l.created_at > lastSeenAt).length;
}
