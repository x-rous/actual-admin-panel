"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConnectionStore, selectActiveInstance } from "@/store/connection";
import { apiRequest } from "@/lib/api/client";
import type { NextMonthHoldInput } from "../types";

type UseNextMonthHoldReturn = {
  setHold: (month: string, input: NextMonthHoldInput) => Promise<void>;
  clearHold: (month: string) => Promise<void>;
  isPending: boolean;
  error: string | null;
};

/**
 * Envelope-mode: immediate next-month budget hold management.
 *
 * setHold calls POST /months/{month}/nextmonthbudgethold.
 * clearHold calls DELETE /months/{month}/nextmonthbudgethold.
 * Both bypass the staged edits pipeline and take effect immediately on confirm.
 * Both invalidate the affected month's TanStack Query cache on success.
 */
export function useNextMonthHold(): UseNextMonthHoldReturn {
  const connection = useConnectionStore(selectActiveInstance);
  const queryClient = useQueryClient();

  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const invalidateMonth = useCallback(
    async (month: string) => {
      if (!connection) return;
      await queryClient.invalidateQueries({
        queryKey: ["budget-month-data", connection.id, month],
      });
    },
    [connection, queryClient]
  );

  const setHold = useCallback(
    async (month: string, input: NextMonthHoldInput): Promise<void> => {
      if (!connection) throw new Error("No active connection");

      setIsPending(true);
      setError(null);

      try {
        await apiRequest(connection, `/months/${month}/nextmonthbudgethold`, {
          method: "POST",
          body: { amount: input.amount },
        });
        await invalidateMonth(month);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to set hold";
        setError(message);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [connection, invalidateMonth]
  );

  const clearHold = useCallback(
    async (month: string): Promise<void> => {
      if (!connection) throw new Error("No active connection");

      setIsPending(true);
      setError(null);

      try {
        await apiRequest(connection, `/months/${month}/nextmonthbudgethold`, {
          method: "DELETE",
        });
        await invalidateMonth(month);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to clear hold";
        setError(message);
        throw err;
      } finally {
        setIsPending(false);
      }
    },
    [connection, invalidateMonth]
  );

  return { setHold, clearHold, isPending, error };
}
