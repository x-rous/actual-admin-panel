"use client";

import { useQueries } from "@tanstack/react-query";
import { getApiVersion, getServerVersion } from "@/lib/api/client";
import type { ConnectionInstance } from "@/store/connection";

type ServerVersions = {
  apiVersion: string | null;
  serverVersion: string | null;
  isLoading: boolean;
};

/**
 * Fetches actual-http-api and Actual Budget server versions for the active
 * connection. Both are cached permanently (staleTime: Infinity) — versions
 * do not change mid-session. Failures are silently ignored so that older
 * API versions that don't expose these endpoints don't break the UI.
 */
export function useServerVersions(
  connection: ConnectionInstance | null
): ServerVersions {
  const results = useQueries({
    queries: [
      {
        queryKey: ["apiVersion", connection?.baseUrl],
        queryFn: () => getApiVersion(connection!.baseUrl, connection!.apiKey),
        enabled: !!connection,
        staleTime: Infinity,
        retry: false,
      },
      {
        queryKey: ["serverVersion", connection?.baseUrl, connection?.budgetSyncId],
        queryFn: () => getServerVersion(connection!),
        enabled: !!connection,
        staleTime: Infinity,
        retry: false,
      },
    ],
  });

  return {
    apiVersion: (results[0].data as string | undefined) ?? null,
    serverVersion: (results[1].data as string | undefined) ?? null,
    isLoading: results[0].isLoading || results[1].isLoading,
  };
}
