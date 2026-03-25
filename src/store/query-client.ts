"use client";

import { QueryClient } from "@tanstack/react-query";

/**
 * Creates a TanStack Query client configured for this app.
 * Data is never persisted — all caches are session-only.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Don't refetch on window focus — admin tool, user controls when to reload
        refetchOnWindowFocus: false,
        // Retry once on failure before surfacing an error
        retry: 1,
        staleTime: 1000 * 60 * 5, // 5 minutes
      },
    },
  });
}
