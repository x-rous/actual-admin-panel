"use client";

import { useRef, useState } from "react";
import { useBudgetEditsStore } from "@/store/budgetEdits";
import { useEffectiveMonthData } from "../hooks/useEffectiveMonthData";
import { parseBudgetExpression } from "../lib/budgetMath";
import { isIncomeBlocked, isLargeChange } from "../lib/budgetValidation";
import type { BudgetCellKey, BudgetMode, CellView, LoadedCategory, NavDirection } from "../types";

type Props = {
  category: LoadedCategory;
  month: string;
  budgetMode: BudgetMode;
  cellView: CellView;
  isSelected: boolean;
  isAnchor: boolean;
  onFocus: (categoryId: string, month: string) => void;
  onRangeSelect: (categoryId: string, month: string) => void;
  onNavigate?: (dir: NavDirection) => void;
  /** Shared drag-state ref from BudgetGrid — set to true when mouse moves across cells. */
  isDraggingRef?: { current: boolean };
  /** Called when the user right-clicks the cell. */
  onContextMenuRequest?: (catId: string, month: string, carryover: boolean, x: number, y: number) => void;
  /** When true, renders the cell at 50% opacity (hidden category/group shown). */
  isDimmed?: boolean;
};

function formatAmount(minor: number): string {
  return (minor / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}


/**
 * A single budget grid cell for a (category, month) intersection.
 *
 * Displays the budgeted amount (staged or persisted) for the specific month.
 * In edit mode, accepts numeric values or arithmetic expressions.
 * Income cells are hard-blocked in envelope mode.
 * Supports drag-to-select (via isDraggingRef) and shift+arrow range extension.
 */
export function BudgetCell({
  category,
  month,
  budgetMode,
  cellView,
  isSelected,
  isAnchor,
  onFocus,
  onRangeSelect,
  onNavigate,
  isDraggingRef,
  onContextMenuRequest,
  isDimmed,
}: Props) {
  const dimClass = isDimmed ? " opacity-50" : "";
  const key: BudgetCellKey = `${month}:${category.id}`;
  const edits = useBudgetEditsStore((s) => s.edits);
  const stageEdit = useBudgetEditsStore((s) => s.stageEdit);
  const removeEdit = useBudgetEditsStore((s) => s.removeEdit);

  // Load this month's effective data (server state + staged deltas applied locally).
  // useEffectiveMonthData is cached by TanStack Query — one API call per unique month.
  const { data: effectiveData } = useEffectiveMonthData(month);
  const effectiveCategory = effectiveData?.categoriesById[category.id] ?? category;

  const stagedEdit = edits[key];
  const currentBudgeted = effectiveCategory.budgeted;
  const blocked = isIncomeBlocked(category, budgetMode);
  // Editing is only possible in the "budgeted" view.
  const viewBlocked = cellView !== "budgeted";

  // The value shown in the cell (effective value for all views).
  // In Envelope mode, income cells always show actuals (received) — there is
  // no budget or variance concept for income in envelope budgeting.
  const envelopeIncome = budgetMode === "envelope" && category.isIncome;
  const displayMinor = envelopeIncome
    ? effectiveCategory.actuals
    : cellView === "spent"
    ? effectiveCategory.actuals
    : cellView === "balance"
    ? effectiveCategory.balance
    : currentBudgeted;


  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const enterEdit = (initialValue?: string) => {
    if (blocked || viewBlocked || editing) return;
    setInputValue(initialValue ?? formatAmount(currentBudgeted));
    setInputError(null);
    setEditing(true);
    requestAnimationFrame(() => {
      if (initialValue !== undefined) {
        const len = initialValue.length;
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(len, len);
      } else {
        inputRef.current?.select();
      }
    });
  };

  /** Returns true if commit succeeded (valid parse), false on error. */
  const commitEdit = (): boolean => {
    if (!editing) return true;
    const result = parseBudgetExpression(inputValue);
    if (!result.ok) {
      setInputError(result.error);
      return false;
    }
    setEditing(false);
    setInputError(null);
    // originalValue is the server-persisted value before any staged edits.
    const originalValue = stagedEdit?.previousBudgeted ?? effectiveCategory.budgeted;
    if (result.value === originalValue) {
      // User reverted to the original — remove the staged edit so the cell is clean.
      if (stagedEdit) removeEdit(key);
    } else if (result.value !== currentBudgeted) {
      // Value genuinely changed from current — stage the edit.
      stageEdit({
        month,
        categoryId: category.id,
        nextBudgeted: result.value,
        previousBudgeted: originalValue,
        source: "manual",
      });
    }
    return true;
  };

  const cancelEdit = () => {
    setEditing(false);
    setInputError(null);
    setInputValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (commitEdit()) onNavigate?.("down");
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelEdit();
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (commitEdit()) onNavigate?.(e.shiftKey ? "shift-tab" : "tab");
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === "F2") {
      if (blocked || viewBlocked) return;
      e.preventDefault();
      enterEdit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      onNavigate?.(e.shiftKey ? "shift-up" : "up");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      onNavigate?.(e.shiftKey ? "shift-down" : "down");
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      onNavigate?.(e.shiftKey ? "shift-left" : "left");
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      onNavigate?.(e.shiftKey ? "shift-right" : "right");
    } else if (e.key === "Tab") {
      e.preventDefault();
      onNavigate?.(e.shiftKey ? "shift-tab" : "tab");
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (blocked || viewBlocked) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      if (currentBudgeted !== 0) {
        const originalValue = stagedEdit?.previousBudgeted ?? effectiveCategory.budgeted;
        if (originalValue === 0) {
          // Going back to the original value of 0 — remove the staged edit.
          if (stagedEdit) removeEdit(key);
        } else {
          stageEdit({
            month,
            categoryId: category.id,
            nextBudgeted: 0,
            previousBudgeted: originalValue,
            source: "manual",
          });
        }
      }
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (blocked || viewBlocked) return;
      e.preventDefault();
      enterEdit(e.key);
    }
  };

  /** On mousedown: reset drag flag and set this cell as the selection anchor. */
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.shiftKey) return; // shift+click handled by click handler
    if (isDraggingRef) isDraggingRef.current = false;
    onFocus(category.id, month);
  };

  /**
   * On mouseenter with left button held: extend the selection (drag-select).
   * Works for both blocked and editable cells so you can drag across the grid.
   */
  const handleMouseEnter = (e: React.MouseEvent) => {
    if (e.buttons === 1) {
      if (isDraggingRef) isDraggingRef.current = true;
      onRangeSelect(category.id, month);
    }
  };

  /** Click: if shift, extend selection; otherwise enter edit (unless drag just ended). */
  const handleClick = (e: React.MouseEvent) => {
    if (e.shiftKey) {
      onRangeSelect(category.id, month);
    } else if (!isDraggingRef?.current) {
      // Anchor was already set in mousedown; just open the editor.
      enterEdit();
    }
    // When isDragging=true the mousedown already handled selection extension;
    // don't enter edit mode or collapse the range.
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    onContextMenuRequest?.(category.id, month, effectiveCategory.carryover, e.clientX, e.clientY);
  };

  const hasSaveError = !!stagedEdit?.saveError;
  const hasLargeChange =
    stagedEdit != null &&
    isLargeChange(stagedEdit.previousBudgeted, stagedEdit.nextBudgeted);

  // Carryover indicator (top-right triangle)
  const carryoverIndicator = effectiveCategory.carryover ? (
    <span
      className="absolute top-0 right-0 border-[5px] border-transparent border-t-blue-400/80 border-r-blue-400/80"
      title="Rollover enabled"
      aria-hidden="true"
    />
  ) : null;

  // Hover tooltip: show spent/balance when in budgeted view (they aren't directly visible).
  const hoverTitle =
    cellView === "budgeted"
      ? `Spent: ${formatAmount(effectiveCategory.actuals)} | Balance: ${formatAmount(effectiveCategory.balance)}`
      : undefined;

  // ─── Blocked / read-only cell ────────────────────────────────────────────────
  if (blocked || viewBlocked) {
    const blockedLabel = blocked
      ? `${category.name} budget for ${month} — income editing blocked in envelope mode`
      : `${category.name} ${cellView} for ${month}`;

    let blockedCellClass =
      "relative h-7 px-2 flex items-center justify-end text-xs font-sans tabular-nums select-none outline-none border-r border-b border-border/50 cursor-not-allowed";

    blockedCellClass += " bg-muted/30";

    return (
      <div
        className={`${blockedCellClass}${dimClass}`}
        role="gridcell"
        aria-label={blockedLabel}
        aria-readonly="true"
        aria-disabled={blocked ? "true" : undefined}
        onMouseDown={handleMouseDown}
        onMouseEnter={handleMouseEnter}
        onKeyDown={handleCellKeyDown}
        onContextMenu={handleContextMenu}
        tabIndex={0}
        title={hoverTitle}
        data-month={month}
        data-category-id={category.id}
      >
        {carryoverIndicator}
        <span
          className={
            cellView === "balance" && displayMinor < 0
              ? "text-destructive"
              : cellView === "spent"
              ? "text-foreground"
              : "text-muted-foreground"
          }
        >
          {formatAmount(displayMinor)}
        </span>
      </div>
    );
  }

  // ─── Editing cell ────────────────────────────────────────────────────────────
  if (editing) {
    return (
      <div
        className={`relative h-7 px-0.5 flex items-center border-r border-b border-border/50 bg-background ring-2 ring-inset ring-foreground/80 z-10${dimClass}`}
        role="gridcell"
        onMouseEnter={handleMouseEnter}
        onContextMenu={handleContextMenu}
        data-month={month}
        data-category-id={category.id}
      >
        {carryoverIndicator}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setInputError(null);
          }}
          onKeyDown={handleKeyDown}
          onBlur={commitEdit}
          className="w-full h-full px-1.5 text-xs font-sans tabular-nums bg-transparent outline-none text-right"
          aria-label={`Edit budget for ${category.name} in ${month}`}
          autoComplete="off"
          spellCheck={false}
        />
        {inputError && (
          <div
            className="absolute top-full left-0 z-20 bg-destructive text-destructive-foreground text-xs px-2 py-1 rounded shadow"
            role="alert"
          >
            {inputError}
          </div>
        )}
      </div>
    );
  }

  // ─── Normal cell ─────────────────────────────────────────────────────────────
  let cellClass =
    "relative h-7 px-2 flex items-center justify-end text-xs font-sans tabular-nums select-none outline-none border-r border-b border-border/50 cursor-default transition-colors";

  if (isAnchor) {
    cellClass += " ring-2 ring-inset ring-foreground/80";
  } else if (isSelected) {
    cellClass += " bg-primary/10";
  } else {
    cellClass += " hover:bg-muted/40 focus:bg-muted/40";
  }

  if (stagedEdit) {
    cellClass += " bg-amber-50 dark:bg-amber-950/20";
  }

  if (hasSaveError) {
    cellClass += " bg-red-50 dark:bg-red-950/20";
  }

  return (
    <div
      className={`${cellClass}${dimClass}`}
      role="gridcell"
      tabIndex={0}
      aria-label={`${category.name} budget for ${month}${stagedEdit ? " (unsaved)" : ""}${hasSaveError ? " — save error" : ""}`}
      aria-selected={isSelected}
      onMouseDown={handleMouseDown}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
      onKeyDown={handleCellKeyDown}
      onContextMenu={handleContextMenu}
      title={hoverTitle}
      data-month={month}
      data-category-id={category.id}
    >
      {carryoverIndicator}
      <span
        className={
          stagedEdit
            ? "text-amber-700 dark:text-amber-400 font-semibold"
            : hasSaveError
            ? "text-destructive"
            : "text-foreground"
        }
      >
        {formatAmount(displayMinor)}
      </span>

      {hasLargeChange && (
        <span
          className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-orange-400"
          aria-hidden="true"
          title="Large change"
        />
      )}

      {hasSaveError && (
        <span
          className="absolute top-0.5 left-0.5 w-1.5 h-1.5 rounded-full bg-destructive"
          aria-hidden="true"
          title={stagedEdit?.saveError}
        />
      )}
    </div>
  );
}
