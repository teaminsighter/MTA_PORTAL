"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/*
 * Root client-side providers. Kept minimal so the RSC tree stays server
 * by default; a component opts into React Query by importing a hook
 * that uses useQuery().
 *
 * QueryClient sits in useState so React only constructs it once per
 * mount — never per render — while still being a per-request instance
 * (avoids leaking state across users when this eventually runs in a
 * Cloudflare Worker's edge SSR).
 */
export default function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: true,
            staleTime: 10_000,
            // Retries make transient network blips silent; capped low
            // so a truly-down server doesn't hammer the box.
            retry: 1,
          },
        },
      })
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
