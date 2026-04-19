"use client";

import { useState } from "react";
import { useCategoryTransfer } from "../hooks/useCategoryTransfer";
import type { LoadedCategory } from "../types";

type Props = {
  month: string;
  categories: LoadedCategory[];
  onClose: () => void;
};

/**
 * Envelope-mode: immediate category-to-category budget transfer dialog.
 *
 * Filters to non-income spending categories only.
 * Displays a disclaimer that the action is immediate and bypasses the save panel.
 */
export function CategoryTransferDialog({ month, categories, onClose }: Props) {
  const { transfer, isPending, error } = useCategoryTransfer();

  // Eligible categories: non-income, non-hidden spending categories
  const eligible = categories.filter((c) => !c.isIncome && !c.hidden);

  const [fromId, setFromId] = useState(eligible[0]?.id ?? "");
  const [toId, setToId] = useState(eligible[1]?.id ?? "");
  const [amountStr, setAmountStr] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleTransfer = async () => {
    setLocalError(null);

    if (!fromId || !toId) {
      setLocalError("Please select source and destination categories.");
      return;
    }
    if (fromId === toId) {
      setLocalError("Source and destination must be different categories.");
      return;
    }

    const amount = Math.round(parseFloat(amountStr) * 100);
    if (isNaN(amount) || amount <= 0) {
      setLocalError("Please enter a valid positive amount.");
      return;
    }

    try {
      await transfer(month, {
        fromCategoryId: fromId,
        toCategoryId: toId,
        amount,
      });
      setDone(true);
    } catch {
      // error is set by the hook
    }
  };

  const displayError = localError ?? error;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Transfer budget between categories"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-background border border-border rounded-lg shadow-xl w-full max-w-sm mx-4 p-5">
        {!done ? (
          <>
            <h2 className="text-base font-semibold mb-1">Transfer Budget</h2>
            <p className="text-xs text-muted-foreground mb-4">
              Month: <span className="font-mono">{month}</span>
            </p>

            <div className="space-y-3 mb-4">
              <div>
                <label htmlFor="transfer-from" className="block text-sm font-medium mb-1">
                  From category
                </label>
                <select
                  id="transfer-from"
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  disabled={isPending}
                  className="w-full text-sm border border-border rounded px-2 py-1.5 bg-background"
                >
                  {eligible.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="transfer-to" className="block text-sm font-medium mb-1">
                  To category
                </label>
                <select
                  id="transfer-to"
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  disabled={isPending}
                  className="w-full text-sm border border-border rounded px-2 py-1.5 bg-background"
                >
                  {eligible
                    .filter((c) => c.id !== fromId)
                    .map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                </select>
              </div>

              <div>
                <label htmlFor="transfer-amount" className="block text-sm font-medium mb-1">
                  Amount ($)
                </label>
                <input
                  id="transfer-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amountStr}
                  onChange={(e) => setAmountStr(e.target.value)}
                  disabled={isPending}
                  placeholder="0.00"
                  className="w-full text-sm border border-border rounded px-2 py-1.5 bg-background font-mono"
                  aria-label="Transfer amount in dollars"
                />
              </div>
            </div>

            <div
              className="mb-4 p-2 rounded bg-orange-50 dark:bg-orange-950/20 text-xs text-orange-700 dark:text-orange-400"
              role="note"
            >
              This action takes effect immediately and does not go through the save panel.
            </div>

            {displayError && (
              <p className="text-xs text-destructive mb-3" role="alert">{displayError}</p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="px-3 py-1.5 text-sm rounded border border-border hover:bg-muted disabled:opacity-40 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleTransfer()}
                disabled={isPending || eligible.length < 2}
                aria-label="Confirm and transfer budget immediately"
                className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isPending ? "Transferring…" : "Transfer"}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 className="text-base font-semibold mb-3">Transfer Complete</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Budget transferred successfully. The grid has been updated.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
