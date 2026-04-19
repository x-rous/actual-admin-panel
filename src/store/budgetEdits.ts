"use client";

import { create } from "zustand";
import type {
  BudgetCellKey,
  BudgetEditSnapshot,
  BudgetEditsActions,
  BudgetEditsState,
  StagedBudgetEdit,
} from "@/features/budget-management/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeKey(edit: StagedBudgetEdit): BudgetCellKey {
  return `${edit.month}:${edit.categoryId}`;
}

function snapshotEdits(
  edits: Record<BudgetCellKey, StagedBudgetEdit>
): BudgetEditSnapshot {
  return { ...edits };
}

// ─── Store ────────────────────────────────────────────────────────────────────

type BudgetEditsStore = BudgetEditsState & BudgetEditsActions;

const MAX_UNDO_DEPTH = 50;

export const useBudgetEditsStore = create<BudgetEditsStore>()((set, get) => ({
  edits: {},
  undoStack: [],
  redoStack: [],
  uiSelection: { month: null, categoryId: null, groupId: null },
  displayMonths: [],

  pushUndo() {
    const { edits, undoStack } = get();
    set({
      undoStack: [...undoStack, snapshotEdits(edits)].slice(-MAX_UNDO_DEPTH),
      redoStack: [],
    });
  },

  stageEdit(edit) {
    const { edits, undoStack } = get();
    const key = makeKey(edit);
    set({
      undoStack: [...undoStack, snapshotEdits(edits)].slice(-MAX_UNDO_DEPTH),
      redoStack: [],
      edits: { ...edits, [key]: edit },
    });
  },

  stageBulkEdits(newEdits) {
    const { edits, undoStack } = get();
    const patch: Record<BudgetCellKey, StagedBudgetEdit> = {};
    for (const edit of newEdits) {
      patch[makeKey(edit)] = edit;
    }
    set({
      undoStack: [...undoStack, snapshotEdits(edits)].slice(-MAX_UNDO_DEPTH),
      redoStack: [],
      edits: { ...edits, ...patch },
    });
  },

  removeEdit(key) {
    const { edits, undoStack } = get();
    if (!(key in edits)) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [key]: _removed, ...rest } = edits;
    set({
      undoStack: [...undoStack, { ...edits }].slice(-MAX_UNDO_DEPTH),
      redoStack: [],
      edits: rest as Record<BudgetCellKey, StagedBudgetEdit>,
    });
  },

  discardAll() {
    set({ edits: {}, undoStack: [], redoStack: [] });
  },

  clearEditsForMonths(months) {
    const { edits } = get();
    const monthSet = new Set(months);
    const next: Record<BudgetCellKey, StagedBudgetEdit> = {};
    for (const [key, edit] of Object.entries(edits)) {
      if (!monthSet.has(edit.month)) {
        next[key as BudgetCellKey] = edit;
      }
    }
    set({ edits: next });
  },

  clearEditsForKeys(keys) {
    const { edits } = get();
    const keySet = new Set(keys);
    const next: Record<BudgetCellKey, StagedBudgetEdit> = {};
    for (const [key, edit] of Object.entries(edits)) {
      if (!keySet.has(key as BudgetCellKey)) {
        next[key as BudgetCellKey] = edit;
      }
    }
    set({ edits: next });
  },

  setSaveError(key, message) {
    const { edits } = get();
    const existing = edits[key];
    if (!existing) return;
    set({ edits: { ...edits, [key]: { ...existing, saveError: message } } });
  },

  clearSaveError(key) {
    const { edits } = get();
    const existing = edits[key];
    if (!existing) return;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { saveError: _saveError, ...rest } = existing;
    set({ edits: { ...edits, [key]: rest as StagedBudgetEdit } });
  },

  undo() {
    const { edits, undoStack, redoStack } = get();
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1]!;
    set({
      edits: previous,
      undoStack: undoStack.slice(0, -1),
      redoStack: [...redoStack, snapshotEdits(edits)],
    });
  },

  redo() {
    const { edits, undoStack, redoStack } = get();
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1]!;
    set({
      edits: next,
      undoStack: [...undoStack, snapshotEdits(edits)],
      redoStack: redoStack.slice(0, -1),
    });
  },

  hasPendingEdits() {
    return Object.keys(get().edits).length > 0;
  },

  setUiSelection(month, categoryId, groupId = null) {
    set({ uiSelection: { month, categoryId, groupId } });
  },

  setDisplayMonths(months) {
    set({ displayMonths: months });
  },
}));
