// ─── ActualQL query model ─────────────────────────────────────────────────────
//
// Intentionally permissive so the workspace never blocks valid ActualQL patterns.
// Dotted paths, aggregate expressions, $oneof, $transform, options.splits, etc.
// all pass through as-is.

export type ActualQLQuery = {
  table: string;
  filter?: Record<string, unknown>;
  select?: Array<string | Record<string, unknown>> | Record<string, unknown>;
  groupBy?: string[];
  calculate?: Record<string, unknown>;
  orderBy?: Array<string | Record<string, "asc" | "desc">>;
  limit?: number;
  offset?: number;
  options?: {
    splits?: "inline" | "grouped" | "all";
  };
};

// ─── Saved query ──────────────────────────────────────────────────────────────

export type SavedQuery = {
  id: string;
  name: string;
  /** Raw JSON string as the user wrote it */
  query: string;
  createdAt: string;
  updatedAt: string;
  isFavorite?: boolean;
};

// ─── History entry ────────────────────────────────────────────────────────────

export type QueryHistoryEntry = {
  id: string;
  /** Raw JSON string as executed */
  query: string;
  executedAt: string;
  /** Execution time in milliseconds — only present for successful runs. */
  execTime?: number;
  /**
   * Number of rows returned. Set for array results; undefined for scalar
   * (calculate) results or entries written before this field was added.
   */
  rowCount?: number;
};

// ─── Result view ──────────────────────────────────────────────────────────────

export type QueryResultMode = "table" | "raw" | "scalar" | "tree";

// ─── Last executed request (for cURL generation in Phase 2) ──────────────────

export type LastExecutedRequest = {
  query: ActualQLQuery;
  /** Full wrapped editor string at execution time — used for "Copy query JSON". */
  rawQuery: string;
  baseUrl: string;
  budgetSyncId: string;
  apiKey: string;
  encryptionPassword?: string;
};

// ─── Lint warning ─────────────────────────────────────────────────────────────

export type LintWarning = {
  id: string;
  message: string;
};
