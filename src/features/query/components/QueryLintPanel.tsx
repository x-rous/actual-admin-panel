"use client";

import { AlertTriangle } from "lucide-react";
import type { LintWarning } from "../types";

interface QueryLintPanelProps {
  warnings: LintWarning[];
}

export function QueryLintPanel({ warnings }: QueryLintPanelProps) {
  if (warnings.length === 0) return null;

  return (
    <div className="flex shrink-0 flex-col gap-0.5 border-b border-border bg-amber-50/60 px-3 py-1.5 dark:bg-amber-950/20">
      {warnings.map((w) => (
        <div
          key={w.id}
          className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400"
        >
          <AlertTriangle className="mt-px h-3 w-3 shrink-0" />
          {w.message}
        </div>
      ))}
    </div>
  );
}
