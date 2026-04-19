/**
 * Budget cell validation helpers.
 *
 * LARGE_CHANGE_THRESHOLD: edits that exceed this absolute delta are flagged
 * as suspiciously large in the pre-save review panel (FR-021).
 * Value: 500,000 minor units = $5,000 at 100¢/$.
 */

import type { BudgetMode, LoadedCategory } from "../types";

export const LARGE_CHANGE_THRESHOLD = 500_000;

/**
 * Returns true when the absolute difference between prev and next exceeds the
 * large-change threshold. Used to surface pre-save warnings.
 */
export function isLargeChange(prev: number, next: number): boolean {
  return Math.abs(next - prev) > LARGE_CHANGE_THRESHOLD;
}

/**
 * Returns true when the category is an income category AND the active budget
 * mode is envelope. In that case, the cell must be hard-blocked from editing.
 */
export function isIncomeBlocked(
  category: LoadedCategory,
  mode: BudgetMode
): boolean {
  return category.isIncome && mode === "envelope";
}
