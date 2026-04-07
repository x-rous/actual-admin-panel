"use client";

import { useEffect } from "react";
import { useStagedStore } from "@/store/staged";

/**
 * Wires global keyboard shortcuts for the staged store.
 * Must be called once, inside a client component (AppShell).
 *
 * Ctrl/Cmd+Z        → undo
 * Ctrl/Cmd+Shift+Z  → redo
 * Ctrl/Cmd+Y        → redo (Windows convention)
 *
 * Shortcuts are suppressed when focus is inside an input, textarea, or
 * contentEditable element so native browser text-undo is not broken.
 */
export function useKeyboardShortcuts() {
  const undo = useStagedStore((s) => s.undo);
  const redo = useStagedStore((s) => s.redo);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      // Don't steal Ctrl+Z from text inputs — let the browser handle it.
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) return;

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [undo, redo]);
}
