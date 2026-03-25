"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAccounts } from "@/lib/api/accounts";
import { useConnectionStore, selectActiveInstance } from "@/store/connection";
import { useStagedStore } from "@/store/staged";

/**
 * Fetches accounts from the API and loads them into the staged store.
 * Re-runs whenever the active connection changes.
 */
export function useAccounts() {
  const connection = useConnectionStore(selectActiveInstance);
  const loadAccounts = useStagedStore((s) => s.loadAccounts);

  const query = useQuery({
    queryKey: ["accounts", connection?.id],
    queryFn: () => {
      if (!connection) throw new Error("No active connection");
      return getAccounts(connection);
    },
    enabled: !!connection,
    // Do not reuse stale cache — always reload on mount so the grid
    // reflects what is currently on the server.
    staleTime: 0,
    // Never refetch in the background: a focus or interval refetch would
    // call loadAccounts and silently wipe all unsaved staged changes.
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // When server data arrives, populate the staged store. This resets any
  // unsaved edits for this entity type — intentional after a successful save
  // or on first load.
  useEffect(() => {
    if (query.data) {
      loadAccounts(query.data);
    }
  }, [query.data, loadAccounts]);

  return query;
}
