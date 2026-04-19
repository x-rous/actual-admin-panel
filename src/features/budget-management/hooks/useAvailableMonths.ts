"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnectionStore, selectActiveInstance } from "@/store/connection";
import { apiRequest } from "@/lib/api/client";

/**
 * Fetches the list of available months from GET /months.
 * Returns months sorted ascending (oldest first).
 */
export function useAvailableMonths(): {
  data: string[] | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const connection = useConnectionStore(selectActiveInstance);

  const query = useQuery({
    queryKey: ["budget-months", connection?.id],
    queryFn: async () => {
      if (!connection) throw new Error("No active connection");
      const result = await apiRequest<{ data: string[] }>(
        connection,
        "/months"
      );
      return [...result.data].sort();
    },
    enabled: !!connection,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
