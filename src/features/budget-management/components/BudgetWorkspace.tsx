"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useMonthData } from "../hooks/useMonthData";
import { useBudgetEditsStore } from "@/store/budgetEdits";
import { useConnectionStore, selectActiveInstance } from "@/store/connection";
import { apiRequest } from "@/lib/api/client";
import { parseBudgetExpression } from "../lib/budgetMath";
import { parsePastePayload, resolveSelectionCells } from "../lib/budgetSelectionUtils";
import { useBulkAction, type BulkActionType } from "../hooks/useBulkAction";
import { BudgetGrid } from "./BudgetGrid";
import { BudgetSelectionSummary } from "./BudgetSelectionSummary";
import { BulkActionDialog } from "./BulkActionDialog";
import { BudgetCellContextMenu } from "./BudgetCellContextMenu";
import type {
  BudgetCellKey,
  BudgetCellSelection,
  BudgetMode,
  CellView,
  LoadedCategory,
  LoadedMonthState,
  NavDirection,
  NavItem,
  StagedBudgetEdit,
} from "../types";
import { useLocalState } from "../hooks/useLocalState";

const IMMEDIATE_BULK_ACTIONS: BulkActionType[] = [
  "copy-previous-month",
  "set-to-zero",
  "avg-3-months",
  "avg-6-months",
  "avg-12-months",
];

type ContextMenuState = {
  x: number;
  y: number;
  categoryId: string;
  month: string;
  carryover: boolean;
} | null;

type Props = {
  budgetMode: BudgetMode;
  cellView: CellView;
  activeMonths: string[];
  availableMonths: string[];
  /** Collapse state lifted from BudgetManagementView so toolbar can control it. */
  collapsedGroups: Set<string>;
  onToggleCollapse: (groupId: string) => void;
  /** When true, hidden groups/categories are rendered (dimmed); when false they are hidden. */
  showHidden?: boolean;
  /** When true, open the bulk action dialog for the current selection */
  bulkActionOpen?: boolean;
  onBulkActionClose?: () => void;
  onOpenTransfer?: () => void;
};

/**
 * Main workspace composite: grid + context panel + selection summary footer.
 * Owns BudgetCellSelection local state and coordinates paste, copy, undo/redo,
 * and keyboard navigation across cells.
 */
export function BudgetWorkspace({
  budgetMode,
  cellView,
  activeMonths,
  availableMonths,
  collapsedGroups,
  onToggleCollapse,
  showHidden = false,
  bulkActionOpen = false,
  onBulkActionClose,
  onOpenTransfer,
}: Props) {
  const [selection, setSelection] = useLocalState<BudgetCellSelection | null>(null);
  const [groupSelection, setGroupSelection] = useState<{ groupId: string; month: string } | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(null);
  const [pendingBulkAction, setPendingBulkAction] = useState<BulkActionType | null>(null);

  const workspaceRef = useRef<HTMLDivElement>(null);
  const { preview: previewBulk, apply: applyBulk } = useBulkAction();

  const undo = useBudgetEditsStore((s) => s.undo);
  const redo = useBudgetEditsStore((s) => s.redo);
  const stageBulkEdits = useBudgetEditsStore((s) => s.stageBulkEdits);
  const setUiSelection = useBudgetEditsStore((s) => s.setUiSelection);

  // Sync focused cell or group to store so BudgetDraftPanel can read it.
  useEffect(() => {
    if (groupSelection) {
      setUiSelection(groupSelection.month, null, groupSelection.groupId);
    } else {
      setUiSelection(selection?.anchorMonth ?? null, selection?.anchorCategoryId ?? null, null);
    }
  }, [selection, groupSelection, setUiSelection]);

  const queryClient = useQueryClient();
  const connection = useConnectionStore(selectActiveInstance);

  const firstMonth = activeMonths[0] ?? null;
  const { data: firstMonthData } = useMonthData(firstMonth);
  // Categories in visual order — used for paste, copy, delete, selection bounds.
  // When showHidden=false, hidden groups and hidden categories are excluded.
  const categories = useMemo(() => {
    if (!firstMonthData) return [];
    const { groupOrder, groupsById, categoriesById } = firstMonthData;
    const expenseIds = groupOrder.filter((id) => !groupsById[id]!.isIncome);
    const incomeIds = groupOrder.filter((id) => groupsById[id]!.isIncome);
    return [...expenseIds, ...incomeIds]
      .filter((id) => showHidden || !groupsById[id]!.hidden)
      .flatMap((id) =>
        (groupsById[id]?.categoryIds ?? [])
          .map((catId) => categoriesById[catId]!)
          .filter((cat) => showHidden || !cat.hidden)
      );
  }, [firstMonthData, showHidden]);

  // Interleaved nav list: group row followed by its visible (and expanded) categories.
  // Used for Up/Down/Tab keyboard navigation so group rows are reachable.
  const navItems = useMemo((): NavItem[] => {
    if (!firstMonthData) return [];
    const { groupOrder, groupsById, categoriesById } = firstMonthData;
    const expenseIds = groupOrder.filter((id) => !groupsById[id]!.isIncome);
    const incomeIds = groupOrder.filter((id) => groupsById[id]!.isIncome);
    const items: NavItem[] = [];
    for (const groupId of [...expenseIds, ...incomeIds]) {
      const group = groupsById[groupId];
      if (!group) continue;
      if (!showHidden && group.hidden) continue;
      items.push({ type: "group", id: groupId });
      if (!collapsedGroups.has(groupId)) {
        for (const catId of group.categoryIds) {
          const cat = categoriesById[catId];
          if (!cat) continue;
          if (!showHidden && cat.hidden) continue;
          items.push({ type: "category", id: catId });
        }
      }
    }
    return items;
  }, [firstMonthData, showHidden, collapsedGroups]);

  const handleCellFocus = useCallback(
    (categoryId: string, month: string) => {
      setContextMenu(null);
      setGroupSelection(null);
      setSelection({
        anchorCategoryId: categoryId,
        anchorMonth: month,
        focusCategoryId: categoryId,
        focusMonth: month,
      });
    },
    [setSelection]
  );

  const handleGroupFocus = useCallback(
    (groupId: string, month: string) => {
      setContextMenu(null);
      setSelection(null);
      setGroupSelection({ groupId, month });
    },
    [setSelection]
  );

  const handleCellRangeSelect = useCallback(
    (categoryId: string, month: string) => {
      setSelection((prev) => {
        if (!prev) {
          return {
            anchorCategoryId: categoryId,
            anchorMonth: month,
            focusCategoryId: categoryId,
            focusMonth: month,
          };
        }
        return {
          ...prev,
          focusCategoryId: categoryId,
          focusMonth: month,
        };
      });
    },
    [setSelection]
  );

  /** Unified navigation: moves focus through the interleaved navItems list. */
  const navigateFrom = useCallback(
    (fromItem: NavItem, fromMonth: string, dir: NavDirection) => {
      const itemIdx = navItems.findIndex(
        (i) => i.type === fromItem.type && i.id === fromItem.id
      );
      const monthIdx = activeMonths.indexOf(fromMonth);
      if (itemIdx === -1 || monthIdx === -1) return;

      // Shift+arrow: range extension — categories only, skip group items.
      if (
        dir === "shift-up" ||
        dir === "shift-down" ||
        dir === "shift-left" ||
        dir === "shift-right"
      ) {
        if (fromItem.type !== "category") return;
        setSelection((prev) => {
          if (!prev) return prev;
          const catOnlyItems = navItems.filter((i) => i.type === "category");
          const focusCatIdx = catOnlyItems.findIndex((i) => i.id === prev.focusCategoryId);
          const focusMonthIdx = activeMonths.indexOf(prev.focusMonth);
          let newFocusCatIdx = focusCatIdx;
          let newFocusMonthIdx = focusMonthIdx;
          if (dir === "shift-up") newFocusCatIdx = Math.max(0, focusCatIdx - 1);
          else if (dir === "shift-down") newFocusCatIdx = Math.min(catOnlyItems.length - 1, focusCatIdx + 1);
          else if (dir === "shift-left") newFocusMonthIdx = Math.max(0, focusMonthIdx - 1);
          else if (dir === "shift-right") newFocusMonthIdx = Math.min(activeMonths.length - 1, focusMonthIdx + 1);
          const newFocusItem = catOnlyItems[newFocusCatIdx];
          const newFocusMonth = activeMonths[newFocusMonthIdx];
          if (!newFocusItem || !newFocusMonth) return prev;
          return { ...prev, focusCategoryId: newFocusItem.id, focusMonth: newFocusMonth };
        });
        return;
      }

      let newItemIdx = itemIdx;
      let newMonthIdx = monthIdx;

      switch (dir) {
        case "up":    newItemIdx = Math.max(0, itemIdx - 1); break;
        case "down":  newItemIdx = Math.min(navItems.length - 1, itemIdx + 1); break;
        case "left":  newMonthIdx = Math.max(0, monthIdx - 1); break;
        case "right": newMonthIdx = Math.min(activeMonths.length - 1, monthIdx + 1); break;
        case "tab":
          if (monthIdx < activeMonths.length - 1) newMonthIdx = monthIdx + 1;
          else { newMonthIdx = 0; newItemIdx = Math.min(navItems.length - 1, itemIdx + 1); }
          break;
        case "shift-tab":
          if (monthIdx > 0) newMonthIdx = monthIdx - 1;
          else { newMonthIdx = activeMonths.length - 1; newItemIdx = Math.max(0, itemIdx - 1); }
          break;
      }

      const newItem = navItems[newItemIdx];
      const newMonth = activeMonths[newMonthIdx];
      if (!newItem || !newMonth) return;

      if (newItem.type === "group") {
        setContextMenu(null);
        setSelection(null);
        setGroupSelection({ groupId: newItem.id, month: newMonth });
        document
          .querySelector<HTMLElement>(
            `[data-group-id="${CSS.escape(newItem.id)}"][data-group-month="${CSS.escape(newMonth)}"]`
          )
          ?.focus();
      } else {
        setContextMenu(null);
        setGroupSelection(null);
        setSelection({
          anchorCategoryId: newItem.id,
          anchorMonth: newMonth,
          focusCategoryId: newItem.id,
          focusMonth: newMonth,
        });
        document
          .querySelector<HTMLElement>(
            `[data-month="${CSS.escape(newMonth)}"][data-category-id="${CSS.escape(newItem.id)}"]`
          )
          ?.focus();
      }
    },
    [navItems, activeMonths, setSelection]
  );

  const handleCellNavigate = useCallback(
    (fromCategoryId: string, fromMonth: string, dir: NavDirection) => {
      navigateFrom({ type: "category", id: fromCategoryId }, fromMonth, dir);
    },
    [navigateFrom]
  );

  const handleGroupNavigate = useCallback(
    (fromGroupId: string, fromMonth: string, dir: NavDirection) => {
      navigateFrom({ type: "group", id: fromGroupId }, fromMonth, dir);
    },
    [navigateFrom]
  );

  /** Copy selected cell values as tab-delimited text (dollar amounts). */
  const handleCopySelection = useCallback(() => {
    if (!selection) return;

    const anchorCatIdx = categories.findIndex((c) => c.id === selection.anchorCategoryId);
    const focusCatIdx = categories.findIndex((c) => c.id === selection.focusCategoryId);
    const anchorMonthIdx = activeMonths.indexOf(selection.anchorMonth);
    const focusMonthIdx = activeMonths.indexOf(selection.focusMonth);

    if (anchorCatIdx === -1 || focusCatIdx === -1 || anchorMonthIdx === -1 || focusMonthIdx === -1) return;

    const minCat = Math.min(anchorCatIdx, focusCatIdx);
    const maxCat = Math.max(anchorCatIdx, focusCatIdx);
    const minMonth = Math.min(anchorMonthIdx, focusMonthIdx);
    const maxMonth = Math.max(anchorMonthIdx, focusMonthIdx);

    const currentEdits = useBudgetEditsStore.getState().edits;

    const rows: string[] = [];
    for (let ci = minCat; ci <= maxCat; ci++) {
      const cat = categories[ci];
      if (!cat) continue;
      const cols: string[] = [];
      for (let mi = minMonth; mi <= maxMonth; mi++) {
        const month = activeMonths[mi];
        if (!month) continue;

        // Read the cached month state to get server value for this month
        const monthState = queryClient.getQueryData<LoadedMonthState>(
          ["budget-month-data", connection?.id, month]
        );
        const catData = monthState?.categoriesById[cat.id] ?? cat;

        const cellKey: BudgetCellKey = `${month}:${cat.id}`;
        const staged = currentEdits[cellKey];
        const minor = staged != null ? staged.nextBudgeted : catData.budgeted;
        cols.push((minor / 100).toFixed(2));
      }
      rows.push(cols.join("\t"));
    }

    const text = rows.join("\n");
    navigator.clipboard.writeText(text).catch(() => undefined);
  }, [selection, categories, activeMonths, queryClient, connection]);

  // Context menu handler
  const handleCellContextMenu = useCallback(
    (catId: string, month: string, carryover: boolean, x: number, y: number) => {
      setContextMenu({ x, y, categoryId: catId, month, carryover });
    },
    []
  );

  // Carryover toggle — immediate API action (not staged)
  const handleCarryoverToggle = useCallback(async () => {
    if (!connection || !contextMenu) return;
    const { categoryId, month, carryover } = contextMenu;
    const newValue = !carryover;
    // Apply to this month and all months in activeMonths that are >= this month
    const monthsToUpdate = activeMonths.filter((m) => m >= month);
    for (const m of monthsToUpdate) {
      await apiRequest(connection, `/months/${m}/categories/${categoryId}`, {
        method: "PATCH",
        body: { category: { carryover: newValue } },
      });
    }
    // Invalidate affected months
    for (const m of monthsToUpdate) {
      await queryClient.invalidateQueries({
        queryKey: ["budget-month-data", connection.id, m],
      });
    }
  }, [connection, contextMenu, activeMonths, queryClient]);

  // Clear selection on any click outside the workspace div (TopBar, Sidebar, Toolbar, etc.)
  useEffect(() => {
    const handleDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target.closest("[role=dialog]")) return;
      if (workspaceRef.current?.contains(target)) return;
      setSelection(null);
      setGroupSelection(null);
    };
    document.addEventListener("mousedown", handleDocMouseDown);
    return () => document.removeEventListener("mousedown", handleDocMouseDown);
  }, [setSelection]);

  // Execute no-input bulk actions immediately from the context menu.
  const handleContextMenuBulkAction = useCallback(
    (action: BulkActionType) => {
      if (!selection) return;
      if (IMMEDIATE_BULK_ACTIONS.includes(action)) {
        const monthDataMap: Record<string, LoadedCategory[]> = {};
        for (const month of activeMonths) {
          const state = queryClient.getQueryData<LoadedMonthState>(["budget-month-data", connection?.id, month]);
          if (state) monthDataMap[month] = Object.values(state.categoriesById);
        }
        // For average actions, also pull up to 12 months before the active window from cache.
        if (action === "avg-3-months" || action === "avg-6-months" || action === "avg-12-months") {
          const lookback = action === "avg-3-months" ? 3 : action === "avg-6-months" ? 6 : 12;
          let m = activeMonths[0] ?? "";
          for (let i = 0; i < lookback; i++) {
            const [y, mo] = m.split("-");
            const d = new Date(parseInt(y ?? "2026", 10), parseInt(mo ?? "1", 10) - 2, 1);
            m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            const state = queryClient.getQueryData<LoadedMonthState>(["budget-month-data", connection?.id, m]);
            if (state) monthDataMap[m] = Object.values(state.categoriesById);
          }
        }
        const rows = previewBulk(action, selection, activeMonths, categories, monthDataMap);
        if (rows && rows.length > 0) applyBulk(rows);
      } else {
        setPendingBulkAction(action);
      }
    },
    [selection, activeMonths, categories, queryClient, connection, previewBulk, applyBulk]
  );

  // Keyboard: undo/redo/copy/delete on the workspace container
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
      } else if (
        (e.ctrlKey || e.metaKey) &&
        (e.key === "y" || (e.shiftKey && e.key === "z"))
      ) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === "c") {
        if (selection) {
          e.preventDefault();
          handleCopySelection();
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        // Multi-cell Delete: zero out all selected cells.
        // Single-cell Delete is handled by BudgetCell's own keyDown handler.
        if (!selection) return;
        const cells = resolveSelectionCells(selection, activeMonths, categories);
        if (cells.length <= 1) return; // let BudgetCell handle single-cell
        e.preventDefault();
        const newEdits: StagedBudgetEdit[] = cells.map((cell) => {
          const monthState = queryClient.getQueryData<LoadedMonthState>(
            ["budget-month-data", connection?.id, cell.month]
          );
          const serverCat = monthState?.categoriesById[cell.categoryId];
          return {
            month: cell.month,
            categoryId: cell.categoryId,
            nextBudgeted: 0,
            previousBudgeted: serverCat?.budgeted ?? 0,
            source: "manual" as const,
          };
        });
        stageBulkEdits(newEdits);
      }
    },
    [undo, redo, selection, handleCopySelection, activeMonths, categories,
     stageBulkEdits, queryClient, connection]
  );

  // Clipboard paste: parse tab-delimited text and stage bulk edits
  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      if (!selection) return;
      const text = e.clipboardData.getData("text/plain");
      if (!text) return;

      const pasteGrid = parsePastePayload(text);
      if (pasteGrid.length === 0 || pasteGrid[0]?.length === 0) return;

      const isSingleValue = pasteGrid.length === 1 && pasteGrid[0]?.length === 1;
      const singleStr = isSingleValue ? (pasteGrid[0]?.[0] ?? "") : "";
      const singleResult = isSingleValue ? parseBudgetExpression(singleStr) : null;

      const newEdits: StagedBudgetEdit[] = [];

      if (isSingleValue && singleResult?.ok) {
        // Single value pasted: fill every cell in the current selection rectangle.
        const cells = resolveSelectionCells(selection, activeMonths, categories);
        for (const cell of cells) {
          const monthState = queryClient.getQueryData<LoadedMonthState>(
            ["budget-month-data", connection?.id, cell.month]
          );
          const serverCat = monthState?.categoriesById[cell.categoryId];
          newEdits.push({
            month: cell.month,
            categoryId: cell.categoryId,
            nextBudgeted: singleResult.value,
            previousBudgeted: serverCat?.budgeted ?? 0,
            source: "paste",
          });
        }
      } else {
        // Multi-value paste: fill from anchor, expand as far as the paste grid.
        const anchorCatIdx = categories.findIndex(
          (c) => c.id === selection.anchorCategoryId
        );
        const anchorMonthIdx = activeMonths.indexOf(selection.anchorMonth);
        if (anchorCatIdx === -1 || anchorMonthIdx === -1) return;

        for (let ri = 0; ri < pasteGrid.length; ri++) {
          const row = pasteGrid[ri];
          if (!row) continue;
          for (let ci = 0; ci < row.length; ci++) {
            const cellStr = row[ci] ?? "";
            const result = parseBudgetExpression(cellStr);
            if (!result.ok) continue;

            const cat = categories[anchorCatIdx + ri];
            const month = activeMonths[anchorMonthIdx + ci];
            if (!cat || !month) continue;

            const monthState = queryClient.getQueryData<LoadedMonthState>(
              ["budget-month-data", connection?.id, month]
            );
            const serverCat = monthState?.categoriesById[cat.id];

            newEdits.push({
              month,
              categoryId: cat.id,
              nextBudgeted: result.value,
              previousBudgeted: serverCat?.budgeted ?? 0,
              source: "paste",
            });
          }
        }
      }

      if (newEdits.length > 0) {
        e.preventDefault();
        stageBulkEdits(newEdits);
      }
    },
    [selection, categories, activeMonths, stageBulkEdits, queryClient, connection]
  );

  return (
    <div
      ref={workspaceRef}
      className="flex flex-col flex-1 min-h-0"
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      tabIndex={-1}
      aria-label="Budget workspace"
    >
      <div className="flex-1 min-w-0 overflow-auto">
        <BudgetGrid
          activeMonths={activeMonths}
          availableMonths={availableMonths}
          budgetMode={budgetMode}
          cellView={cellView}
          selection={selection}
          groupSelection={groupSelection}
          collapsedGroups={collapsedGroups}
          onToggleCollapse={onToggleCollapse}
          showHidden={showHidden}
          onCellFocus={handleCellFocus}
          onCellRangeSelect={handleCellRangeSelect}
          onCellNavigate={handleCellNavigate}
          onCellContextMenu={handleCellContextMenu}
          onGroupFocus={handleGroupFocus}
          onGroupNavigate={handleGroupNavigate}
          onClearSelection={() => {
            setContextMenu(null);
            setSelection(null);
            setGroupSelection(null);
          }}
        />
      </div>
      <BudgetSelectionSummary
        selection={selection}
        activeMonths={activeMonths}
        categories={categories}
      />

      {(bulkActionOpen || pendingBulkAction !== null) && selection && (
        <BulkActionMonthDataLoader
          selection={selection}
          activeMonths={activeMonths}
          categories={categories}
          initialAction={pendingBulkAction ?? undefined}
          onClose={() => {
            onBulkActionClose?.();
            setPendingBulkAction(null);
          }}
        />
      )}

      {contextMenu && (
        <BudgetCellContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          carryover={contextMenu.carryover}
          budgetMode={budgetMode}
          onToggleCarryover={() => void handleCarryoverToggle()}
          onOpenTransfer={onOpenTransfer ?? (() => undefined)}
          onBulkAction={handleContextMenuBulkAction}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

/**
 * Thin loader that calls useMonthData for each active month (hitting TanStack
 * Query cache warmed by BudgetGrid columns) then renders BulkActionDialog with
 * the assembled monthDataMap. Isolated as a component so hooks run at a stable
 * call-site regardless of how many months are active.
 */
function BulkActionMonthDataLoader({
  selection,
  activeMonths,
  categories,
  onClose,
  initialAction,
}: {
  selection: import("../types").BudgetCellSelection;
  activeMonths: string[];
  categories: LoadedCategory[];
  onClose: () => void;
  initialAction?: BulkActionType;
}) {
  // Load each month's data. These are already cached by BudgetGrid columns.
  const m0 = useMonthData(activeMonths[0] ?? null);
  const m1 = useMonthData(activeMonths[1] ?? null);
  const m2 = useMonthData(activeMonths[2] ?? null);
  const m3 = useMonthData(activeMonths[3] ?? null);
  const m4 = useMonthData(activeMonths[4] ?? null);
  const m5 = useMonthData(activeMonths[5] ?? null);
  const m6 = useMonthData(activeMonths[6] ?? null);
  const m7 = useMonthData(activeMonths[7] ?? null);
  const m8 = useMonthData(activeMonths[8] ?? null);
  const m9 = useMonthData(activeMonths[9] ?? null);
  const m10 = useMonthData(activeMonths[10] ?? null);
  const m11 = useMonthData(activeMonths[11] ?? null);

  const allResults = [m0, m1, m2, m3, m4, m5, m6, m7, m8, m9, m10, m11];

  const monthDataMap: Record<string, LoadedCategory[]> = {};
  for (let i = 0; i < activeMonths.length; i++) {
    const month = activeMonths[i];
    const result = allResults[i];
    if (month && result?.data) {
      monthDataMap[month] = Object.values(result.data.categoriesById);
    }
  }

  return (
    <BulkActionDialog
      selection={selection}
      activeMonths={activeMonths}
      categories={categories}
      monthDataMap={monthDataMap}
      onClose={onClose}
      initialAction={initialAction}
    />
  );
}
