"use client";

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useConnectionStore, selectActiveInstance } from "@/store/connection";
import { apiRequest } from "@/lib/api/client";
import { useBudgetEditsStore } from "@/store/budgetEdits";
import type { BudgetCellKey, BudgetSaveResult, StagedBudgetEdit } from "../types";

type SaveProgress = {
  completed: number;
  total: number;
};

type UseBudgetSaveReturn = {
  save: (
    edits: Record<BudgetCellKey, StagedBudgetEdit>
  ) => Promise<BudgetSaveResult[]>;
  isSaving: boolean;
  progress: SaveProgress;
};

/**
 * Feature-local save pipeline for budget cell edits.
 *
 * Issues PATCH /months/{month}/categories/{categoryId} calls sequentially
 * (never in parallel) so the server's budget sync state is not raced.
 *
 * Pre-save: re-fetches GET /months to verify all target months still exist.
 * Progress: exposes { completed, total } updated after each PATCH.
 * Clearing: only keys that received a 200 are removed from the store —
 * failed keys remain with their saveError set, visible in the grid.
 */
export function useBudgetSave(): UseBudgetSaveReturn {
  const connection = useConnectionStore(selectActiveInstance);
  const queryClient = useQueryClient();
  const clearEditsForKeys = useBudgetEditsStore((s) => s.clearEditsForKeys);
  const setSaveError = useBudgetEditsStore((s) => s.setSaveError);

  const [isSaving, setIsSaving] = useState(false);
  const [progress, setProgress] = useState<SaveProgress>({ completed: 0, total: 0 });

  const save = useCallback(
    async (
      edits: Record<BudgetCellKey, StagedBudgetEdit>
    ): Promise<BudgetSaveResult[]> => {
      if (!connection) throw new Error("No active connection");

      const entries = Object.entries(edits) as [BudgetCellKey, StagedBudgetEdit][];
      if (entries.length === 0) return [];

      // Pre-save: verify all target months still exist in GET /months
      const monthsResult = await apiRequest<{ data: string[] }>(connection, "/months");
      const availableSet = new Set(monthsResult.data);

      const validEntries = entries.filter(([, edit]) => availableSet.has(edit.month));
      const invalidEntries = entries.filter(([, edit]) => !availableSet.has(edit.month));

      const results: BudgetSaveResult[] = invalidEntries.map(([, edit]) => ({
        month: edit.month,
        categoryId: edit.categoryId,
        status: "error",
        message: `Month ${edit.month} is no longer available in this budget`,
      }));

      setIsSaving(true);
      setProgress({ completed: 0, total: validEntries.length });

      const succeededKeys: BudgetCellKey[] = [];
      const successMonths = new Set<string>();

      for (let i = 0; i < validEntries.length; i++) {
        const entry = validEntries[i];
        if (!entry) continue;
        const [key, edit] = entry;

        try {
          await apiRequest(connection, `/months/${edit.month}/categories/${edit.categoryId}`, {
            method: "PATCH",
            body: { category: { budgeted: edit.nextBudgeted } },
          });

          // Track at key level — only clear exactly what succeeded.
          succeededKeys.push(key);
          successMonths.add(edit.month);
          results.push({
            month: edit.month,
            categoryId: edit.categoryId,
            status: "success",
          });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : "Save failed";
          setSaveError(key, message);
          results.push({
            month: edit.month,
            categoryId: edit.categoryId,
            status: "error",
            message,
          });
        }

        setProgress({ completed: i + 1, total: validEntries.length });
      }

      // Clear only the keys that actually succeeded — failed keys remain in the
      // store with their saveError property so the grid can show the error state.
      if (succeededKeys.length > 0) {
        clearEditsForKeys(succeededKeys);
        for (const month of successMonths) {
          await queryClient.invalidateQueries({
            queryKey: ["budget-month-data", connection.id, month],
          });
        }
      }

      setIsSaving(false);
      setProgress({ completed: 0, total: 0 });

      return results;
    },
    [connection, queryClient, clearEditsForKeys, setSaveError]
  );

  return { save, isSaving, progress };
}
