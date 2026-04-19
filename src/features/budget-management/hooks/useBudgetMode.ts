"use client";

import { useQuery } from "@tanstack/react-query";
import { useConnectionStore, selectActiveInstance } from "@/store/connection";
import { runQuery } from "@/lib/api/query";
import {
  ZERO_BUDGET_COUNT_QUERY,
  REFLECT_BUDGET_COUNT_QUERY,
} from "@/features/overview/lib/overviewQueries";
import { deriveBudgetMode } from "@/lib/budget/deriveBudgetMode";
import type { BudgetMode } from "../types";

/**
 * Reads the budget mode by running ActualQL queries against zero_budgets and
 * reflect_budgets tables. Normalizes the result to lowercase BudgetMode as
 * used within the budget-management feature.
 */
export function useBudgetMode(): {
  data: BudgetMode | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const connection = useConnectionStore(selectActiveInstance);

  const query = useQuery({
    queryKey: ["budget-mode", connection?.id],
    queryFn: async () => {
      if (!connection) throw new Error("No active connection");

      const [zeroResult, reflectResult] = await Promise.all([
        runQuery<{ data: number }>(connection, ZERO_BUDGET_COUNT_QUERY),
        runQuery<{ data: number }>(connection, REFLECT_BUDGET_COUNT_QUERY),
      ]);

      const upperMode = deriveBudgetMode(zeroResult.data, reflectResult.data);

      // Normalize to lowercase canonical form for the budget-management feature
      const modeMap: Record<string, BudgetMode> = {
        Envelope: "envelope",
        Tracking: "tracking",
        Unidentified: "unidentified",
      };
      return modeMap[upperMode] ?? "unidentified";
    },
    enabled: !!connection,
  });

  return {
    data: query.data,
    isLoading: query.isLoading,
    error: query.error,
  };
}
