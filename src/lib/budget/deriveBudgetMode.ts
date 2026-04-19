/**
 * Shared budget mode derivation utility.
 *
 * Returns the uppercase BudgetMode from overview/types.ts so that the overview
 * feature requires zero changes after extraction. The budget-management feature
 * normalizes to lowercase at the useBudgetMode hook boundary.
 */

import type { BudgetMode } from "@/features/overview/types";

export function deriveBudgetMode(
  zeroBudgetCount: number,
  reflectBudgetCount: number
): BudgetMode {
  if (zeroBudgetCount > reflectBudgetCount) {
    return "Envelope";
  }

  if (reflectBudgetCount > zeroBudgetCount) {
    return "Tracking";
  }

  return "Unidentified";
}
