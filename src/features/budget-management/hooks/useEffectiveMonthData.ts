"use client";

import { useMemo } from "react";
import { useMonthData } from "./useMonthData";
import { useIncomeBudgets } from "./useIncomeBudgets";
import { useBudgetMode } from "./useBudgetMode";
import { useBudgetEditsStore } from "@/store/budgetEdits";
import type { LoadedMonthState } from "../types";

/**
 * Returns a derived LoadedMonthState for the given month with three layers of
 * local overrides applied — no refetch required on any of them:
 *
 * Cascade — Prior-month carry-forward (all modes):
 *   priorDelta = Σ (nextBudgeted - previousBudgeted) for all edits in months < M
 *   summary.incomeAvailable -= priorDelta
 *   summary.toBudget        -= priorDelta
 *
 * Layer 1 — Income budgets (Tracking mode only):
 *   Income category `budgeted` values come from the reflect_budgets query
 *   (POST /run-query). In Tracking mode, income categories are budgeted but
 *   the per-month endpoint doesn't carry those values — this layer fills them
 *   in. Income group `budgeted` is derived as the sum of its categories.
 *   The summary totals are NOT touched here (the API's summary is already
 *   correct in Tracking mode).
 *
 * Layer 2 — Staged edits:
 *   delta = edit.nextBudgeted - baselineBudgeted (after Layer 1)
 *   category.budgeted = edit.nextBudgeted
 *   category.balance += delta
 *   group.budgeted += delta
 *   group.balance += delta
 *   summary.totalBudgeted -= delta  (skipped in Tracking mode for hidden categories)
 *   summary.totalBalance += delta   (skipped in Tracking mode for hidden categories)
 *   summary.toBudget -= delta        (skipped in Tracking mode for hidden categories)
 *
 * Returns undefined while server state is loading or month is null.
 */
export function useEffectiveMonthData(month: string | null | undefined): {
  data: LoadedMonthState | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const { data: serverState, isLoading: monthLoading, error } = useMonthData(month);
  const { data: budgetMode } = useBudgetMode();
  const isTracking = budgetMode === "tracking";

  // Collect income category IDs from server state for the income budgets query.
  // Income categories are consistent across months, so any loaded month works.
  const incomeCategoryIds = useMemo(
    () =>
      serverState
        ? Object.values(serverState.categoriesById)
            .filter((c) => c.isIncome)
            .map((c) => c.id)
        : [],
    [serverState]
  );

  const {
    data: allIncomeBudgets,
    isLoading: incomeBudgetsLoading,
    error: incomeBudgetsError,
  } = useIncomeBudgets(incomeCategoryIds, isTracking);

  // Subscribe to the full edits map — filter by month inside the memo.
  const allEdits = useBudgetEditsStore((s) => s.edits);

  const data = useMemo<LoadedMonthState | undefined>(() => {
    if (!serverState || !month) return serverState;

    // ── Layer 1: Income budgets (Tracking mode) ──────────────────────────────
    const incomeBudgetForMonth = isTracking ? allIncomeBudgets?.get(month) : undefined;

    // ── Layer 2: Staged edits ─────────────────────────────────────────────────
    const prefix = `${month}:`;
    const editEntries = Object.entries(allEdits).filter(([k]) =>
      k.startsWith(prefix)
    );

    // Cascade: sum of deltas from all edits in months strictly before this month.
    // In envelope budgeting, allocating more in a prior month reduces the carry-forward
    // pool available to every subsequent month (incomeAvailable and toBudget).
    // In Tracking mode, effectively-hidden category edits are excluded — a category is
    // effectively hidden if cat.hidden=true OR its parent group is hidden.
    const priorDelta = Object.entries(allEdits).reduce((sum, [key, edit]) => {
      const editMonth = key.split(":")[0];
      if (!editMonth || editMonth >= month) return sum;
      if (isTracking) {
        const catId = key.slice(editMonth.length + 1);
        const cat = serverState.categoriesById[catId];
        const group = cat ? serverState.groupsById[cat.groupId] : undefined;
        if (cat?.hidden || group?.hidden) return sum;
      }
      return sum + (edit.nextBudgeted - edit.previousBudgeted);
    }, 0);

    // Skip all work if nothing to apply.
    if (!incomeBudgetForMonth && editEntries.length === 0 && priorDelta === 0)
      return serverState;

    // Shallow-clone the structures we will mutate.
    const summary = { ...serverState.summary };
    const groupsById = { ...serverState.groupsById };
    const categoriesById = { ...serverState.categoriesById };

    // ── Apply cascade from prior months ───────────────────────────────────────
    // Allocating more in an earlier month reduces the carry-forward pool here.
    if (priorDelta !== 0) {
      summary.incomeAvailable -= priorDelta;
      summary.toBudget -= priorDelta;
    }

    // ── Apply Layer 1 ─────────────────────────────────────────────────────────
    if (incomeBudgetForMonth) {
      // Track per-group budget sums so we can update income group totals.
      const incomeGroupBudgetDelta = new Map<string, number>();

      for (const [catId, budgeted] of incomeBudgetForMonth) {
        const serverCat = serverState.categoriesById[catId];
        if (!serverCat?.isIncome) continue;
        if (serverCat.budgeted === budgeted) continue;
        const delta = budgeted - serverCat.budgeted;

        categoriesById[catId] = {
          ...serverCat,
          budgeted,
          balance: serverCat.balance + delta,
        };

        const prev = incomeGroupBudgetDelta.get(serverCat.groupId) ?? 0;
        incomeGroupBudgetDelta.set(serverCat.groupId, prev + delta);
      }

      // Apply accumulated deltas to income groups.
      for (const [groupId, delta] of incomeGroupBudgetDelta) {
        const existing = groupsById[groupId] ?? serverState.groupsById[groupId];
        if (existing) {
          groupsById[groupId] = {
            ...existing,
            budgeted: existing.budgeted + delta,
            balance: existing.balance + delta,
          };
        }
      }
      // summary.totalBudgeted is NOT updated — the API's summary already
      // reflects income budgets in Tracking mode.
    }

    // ── Apply Layer 2 ─────────────────────────────────────────────────────────
    for (const [key, edit] of editEntries) {
      const catId = key.slice(prefix.length);
      // Use the post-Layer-1 category as baseline (it may have been updated above).
      const baseCat = categoriesById[catId] ?? serverState.categoriesById[catId];
      if (!baseCat) continue;

      const delta = edit.nextBudgeted - baseCat.budgeted;
      if (delta === 0) continue;

      categoriesById[catId] = {
        ...baseCat,
        budgeted: edit.nextBudgeted,
        balance: baseCat.balance + delta,
      };

      const groupId = baseCat.groupId;
      const existingGroup = groupsById[groupId] ?? serverState.groupsById[groupId];

      // A category is effectively hidden if its own flag is true OR its parent group
      // is hidden (group-hidden categories don't carry cat.hidden=true themselves).
      const effectivelyHidden = baseCat.hidden || (existingGroup?.hidden ?? false);

      // In Tracking mode, an effectively-hidden category only propagates to its group
      // when the group itself is also hidden. A hidden category inside a visible group
      // must not pollute the visible group's aggregate.
      const skipGroupUpdate = isTracking && effectivelyHidden && !(existingGroup?.hidden ?? false);

      if (!skipGroupUpdate && existingGroup) {
        groupsById[groupId] = {
          ...existingGroup,
          budgeted: existingGroup.budgeted + delta,
          balance: existingGroup.balance + delta,
        };
      }

      // In Tracking mode, effectively-hidden category edits never affect the top-level
      // summary rows regardless of whether the group is hidden or visible.
      if (!(isTracking && effectivelyHidden)) {
        // totalBudgeted is always ≤ 0 (more budget allocated → more negative)
        summary.totalBudgeted -= delta;
        summary.totalBalance += delta;
        // toBudget moves opposite to totalBudgeted: budgeting more leaves less to allocate
        summary.toBudget -= delta;
      }
    }

    return {
      summary,
      groupsById,
      categoriesById,
      groupOrder: serverState.groupOrder,
    };
  }, [serverState, allEdits, month, isTracking, allIncomeBudgets]);

  const isLoading = monthLoading || (isTracking && incomeBudgetsLoading);
  const effectiveError =
    error ?? (isTracking && incomeBudgetsError ? incomeBudgetsError : null);

  return { data, isLoading, error: effectiveError };
}
