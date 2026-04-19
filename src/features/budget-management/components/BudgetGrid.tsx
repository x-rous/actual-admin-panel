"use client";

import { useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight, StickyNote, Undo2 } from "lucide-react";
import { useMonthData } from "../hooks/useMonthData";
import { useEffectiveMonthData } from "../hooks/useEffectiveMonthData";
import { useNextMonthHold } from "../hooks/useNextMonthHold";
import { useBudgetEditsStore } from "@/store/budgetEdits";
import { BudgetCell } from "./BudgetCell";
import { NextMonthHoldDialog } from "./NextMonthHoldDialog";
import { EntityNoteButton } from "@/components/ui/entity-note-button";
import { useEntityNote } from "@/hooks/useEntityNote";
import type {
  BudgetCellSelection,
  BudgetMode,
  BudgetMonthSummary,
  CellView,
  LoadedCategory,
  LoadedGroup,
  LoadedMonthState,
  NavDirection,
} from "../types";

// ─── Summary row configuration ────────────────────────────────────────────────

type SummaryRowConfig = {
  label: string;
  dynamicLabel?: (s: BudgetMonthSummary) => string;
  getDynamicRowLabel?: (s: BudgetMonthSummary) => string;
  getValue: (s: BudgetMonthSummary) => number;
  colorClass?: (s: BudgetMonthSummary) => string;
  isConsumptionBar?: boolean;
  getActual?: (s: BudgetMonthSummary, state: LoadedMonthState) => number;
  getTarget?: (s: BudgetMonthSummary, state: LoadedMonthState) => number;
  barMode?: "expense" | "income";
  /** Compact input row — rendered smaller to group visually under a total row. */
  isSubRow?: boolean;
  /** Operator prefix shown in the label cell to convey formula structure (+, −, =). */
  operator?: "+" | "−" | "=";
  /** Override the default row height Tailwind class. */
  rowHeight?: string;
  /** Suppress the top border that normally appears on non-sub, non-bar rows. */
  noBorder?: boolean;
  /** Renders a per-month hold toggle button inside the cell (envelope "To Budget" row). */
  isHoldCell?: boolean;
};

const TRACKING_SUMMARY_ROWS: SummaryRowConfig[] = [
  {
    label: "Expenses",
    getValue: (s) => s.totalSpent,
    isConsumptionBar: true,
    barMode: "expense",
    getActual: (s) => Math.abs(s.totalSpent),
    getTarget: (_s, state) =>
      state.groupOrder
        .map((id) => state.groupsById[id]!)
        .filter((g) => !g.isIncome && !g.hidden)
        .reduce((sum, g) => sum + Math.abs(g.budgeted), 0),
  },
  {
    label: "Income",
    getValue: (s) => s.totalIncome,
    isConsumptionBar: true,
    barMode: "income",
    getActual: (s) => s.totalIncome,
    getTarget: (_s, state) =>
      state.groupOrder
        .map((id) => state.groupsById[id]!)
        .filter((g) => g.isIncome && !g.hidden)
        .reduce((sum, g) => sum + g.budgeted, 0),
  },
  {
    label: "Balance",
    dynamicLabel: (s) => (s.totalBalance >= 0 ? "Savings" : "Overspent"),
    getValue: (s) => s.totalBalance,
    colorClass: (s) =>
      s.totalBalance >= 0
        ? "text-emerald-600 dark:text-emerald-400"
        : "text-destructive",
    rowHeight: "h-10",
    noBorder: true,
  },
];

const ENVELOPE_SUMMARY_ROWS: SummaryRowConfig[] = [
  {
    label: "Available Funds",
    getValue: (s) => s.incomeAvailable,
    colorClass: () => "text-foreground/75",
    isSubRow: true,
    operator: "+",
  },
  {
    label: "Overspent Last Month",
    getValue: (s) => s.lastMonthOverspent,
    colorClass: () => "text-foreground/75",
    isSubRow: true,
    operator: "−",
  },
  {
    label: "Budgeted",
    getValue: (s) => s.totalBudgeted,
    colorClass: () => "text-foreground/75",
    isSubRow: true,
    operator: "−",
  },
  {
    label: "For next month",
    getValue: (s) => s.forNextMonth <= 0 ? 0 : -Math.abs(s.forNextMonth),
    colorClass: () => "text-foreground/75",
    isSubRow: true,
    operator: "−",
  },
  {
    label: "To Budget / Overbudget",
    getValue: (s) => s.toBudget,
    colorClass: (s) =>
      s.toBudget <= 0
        ? "text-destructive"
        : "text-emerald-600 dark:text-emerald-400",
    operator: "=",
    noBorder: true,
    isHoldCell: true,
  },
];

// ─── NoteCell ─────────────────────────────────────────────────────────────────

/** Renders EntityNoteButton only when the entity actually has a note. */
function NoteCell({
  entityId,
  entityLabel,
  entityTypeLabel,
}: {
  entityId: string;
  entityLabel: string;
  entityTypeLabel: string;
}) {
  const { data: note } = useEntityNote("category", entityId, true);
  if (!(note?.trim())) return null;
  return (
    <EntityNoteButton
      entityId={entityId}
      entityKind="category"
      entityLabel={entityLabel}
      entityTypeLabel={entityTypeLabel}
      className="mx-auto"
    />
  );
}

// ─── Format helpers ────────────────────────────────────────────────────────────

/** Full precision — used for group aggregates and individual cells. */
function fmt(n: number): string {
  return (n / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Whole-number format — used for summary rows (less visual noise). */
function fmtSummary(n: number): string {
  return Math.round(n / 100).toLocaleString("en-US");
}

// ─── Hold toggle (envelope "To Budget" cell) ──────────────────────────────────

function HoldClearConfirmDialog({
  month,
  forNextMonth,
  onConfirm,
  onCancel,
  isPending,
}: {
  month: string;
  forNextMonth: number;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Confirm free hold"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
    >
      <div className="bg-background border border-border rounded-lg shadow-xl w-full max-w-xs mx-4 p-4">
        <p className="text-sm font-medium text-foreground mb-0.5">Free the hold for <span className="font-mono">{month}</span>?</p>
        <p className="text-xs text-muted-foreground mb-3">
          Currently holding{" "}
          <span className="font-semibold tabular-nums text-foreground">
            {(forNextMonth / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </span>
        </p>
        <p className="text-xs bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400 rounded px-2.5 py-1.5 mb-4">
          This action takes effect immediately and does not go through the save panel.
        </p>
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-3 py-1.5 text-sm text-foreground rounded border border-border hover:bg-muted disabled:opacity-40 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="px-3 py-1.5 text-sm text-foreground rounded border border-border hover:bg-muted disabled:opacity-40 transition-colors"
          >
            {isPending ? "Clearing…" : "Free Hold"}
          </button>
        </div>
      </div>
    </div>
  );
}

function HoldToggleButton({
  month,
  forNextMonth,
  toBudget,
}: {
  month: string;
  forNextMonth: number;
  toBudget: number;
}) {
  const holdActive = forNextMonth !== 0;
  const { clearHold, isPending } = useNextMonthHold();
  const [showSetDialog, setShowSetDialog] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (holdActive) {
      setShowConfirm(true);
    } else {
      setShowSetDialog(true);
    }
  };

  const handleConfirmClear = async () => {
    await clearHold(month);
    setShowConfirm(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending}
        title={
          holdActive
            ? `Held: ${(forNextMonth / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} — click to free`
            : "Hold funds for next month"
        }
        className={`group flex items-center justify-center w-5 h-5 rounded transition-colors shrink-0 ${
          holdActive
            ? "text-blue-500 dark:text-blue-400 hover:text-orange-500 dark:hover:text-orange-400"
            : "text-muted-foreground/30 hover:text-muted-foreground/70"
        }`}
      >
        {holdActive ? (
          <>
            <ArrowRight className="h-3 w-3 group-hover:hidden" aria-hidden="true" />
            <Undo2 className="h-3 w-3 hidden group-hover:block" aria-hidden="true" />
          </>
        ) : (
          <ArrowRight className="h-3 w-3" aria-hidden="true" />
        )}
      </button>

      {showSetDialog && (
        <NextMonthHoldDialog
          month={month}
          defaultAmount={toBudget > 0 ? toBudget : undefined}
          setOnly
          onClose={() => setShowSetDialog(false)}
        />
      )}

      {showConfirm && (
        <HoldClearConfirmDialog
          month={month}
          forNextMonth={forNextMonth}
          onConfirm={() => void handleConfirmClear()}
          onCancel={() => setShowConfirm(false)}
          isPending={isPending}
        />
      )}
    </>
  );
}

// ─── Props ─────────────────────────────────────────────────────────────────────

type SelectionBounds = {
  minCatIdx: number;
  maxCatIdx: number;
  minMonthIdx: number;
  maxMonthIdx: number;
};

type Props = {
  activeMonths: string[];
  availableMonths: string[];
  budgetMode: BudgetMode;
  cellView: CellView;
  selection: BudgetCellSelection | null;
  groupSelection?: { groupId: string; month: string } | null;
  /** Collapse state lifted to BudgetManagementView so toolbar can control it. */
  collapsedGroups: Set<string>;
  onToggleCollapse: (groupId: string) => void;
  /** When true, hidden groups/categories are rendered dimmed; when false they are omitted. */
  showHidden: boolean;
  onCellFocus: (categoryId: string, month: string) => void;
  onCellRangeSelect: (categoryId: string, month: string) => void;
  onCellNavigate?: (categoryId: string, month: string, dir: NavDirection) => void;
  onCellContextMenu?: (
    catId: string,
    month: string,
    carryover: boolean,
    x: number,
    y: number
  ) => void;
  onGroupFocus?: (groupId: string, month: string) => void;
  onGroupNavigate?: (groupId: string, month: string, dir: NavDirection) => void;
  /** Called when clicking a non-interactive area inside the grid (summary rows, headers, gutters). */
  onClearSelection?: () => void;
};

// ─── Month column header ───────────────────────────────────────────────────────

function MonthColumnHeader({
  month,
  availableMonths,
}: {
  month: string;
  availableMonths: string[];
}) {
  const hasStagedEdits = useBudgetEditsStore((s) =>
    Object.keys(s.edits).some((k) => k.startsWith(`${month}:`))
  );
  const isAvailable = availableMonths.includes(month);

  const [year, mo] = month.split("-");
  const label = new Date(
    parseInt(year ?? "2000", 10),
    parseInt(mo ?? "1", 10) - 1,
    1
  ).toLocaleString("en-US", { month: "short", year: "numeric" });

  const dotColor = !isAvailable
    ? "bg-muted-foreground/40"
    : hasStagedEdits
    ? "bg-amber-400"
    : "bg-green-500";

  const dotTitle = !isAvailable
    ? "Month not yet created on server"
    : hasStagedEdits
    ? "Has unsaved staged changes"
    : "Loaded, no staged changes";

  return (
    <div
      className="h-8 px-2 flex items-center justify-end gap-1.5 border-b-2 border-border bg-muted text-xs font-semibold text-foreground sticky top-0 z-10"
      aria-label={`Month: ${label}`}
    >
      <span
        className={`h-2 w-2 rounded-full shrink-0 ${dotColor}`}
        title={dotTitle}
        aria-hidden="true"
      />
      {label}
    </div>
  );
}

// ─── Consumption bar cell ──────────────────────────────────────────────────────

function ConsumptionBarCell({
  month,
  config,
}: {
  month: string;
  config: SummaryRowConfig;
}) {
  const { data, error } = useEffectiveMonthData(month);
  if (error || !data) return <div className="h-10 bg-transparent" />;

  const actual = config.getActual ? config.getActual(data.summary, data) : 0;
  const target = config.getTarget ? config.getTarget(data.summary, data) : 0;
  const ratio = target > 0 ? actual / target : 0;
  const pct = Math.max(0, Math.min(ratio * 100, 100));

  const isExpense = config.barMode === "expense";
  const barColor = isExpense
    ? ratio <= 1
      ? "bg-emerald-500"
      : "bg-red-500"
    : ratio >= 1
    ? "bg-emerald-500"
    : "bg-amber-400";

  const ratioText = target > 0 ? `${Math.round(ratio * 100)}%` : "—";
  const tooltipText = target > 0
    ? `${isExpense ? "Spent" : "Received"}: ${fmtSummary(actual)}  /  Budgeted: ${fmtSummary(target)}`
    : "No budget set";

  return (
    <div
      className="h-10 px-2 pt-1.5 pb-1.5 flex flex-col gap-0.5 bg-transparent font-sans tabular-nums"
      title={tooltipText}
    >
      <div className="flex items-center justify-end gap-1.5">
        <span className="text-[10px] text-foreground/80 shrink-0">{fmtSummary(actual)}</span>
        <span className="text-[10px] text-muted-foreground/60 shrink-0">({ratioText})</span>
      </div>
      <div className="w-full h-2 rounded-full bg-muted/40 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Summary header rows ───────────────────────────────────────────────────────

function SummaryHeaderRow({
  config,
  activeMonths,
}: {
  config: SummaryRowConfig;
  activeMonths: string[];
}) {
  const { data: firstMonthData } = useMonthData(activeMonths[0] ?? null);
  const rowLabel =
    config.getDynamicRowLabel && firstMonthData
      ? config.getDynamicRowLabel(firstMonthData.summary)
      : config.label;

  const isSubRow = config.isSubRow;
  const rowH = config.rowHeight ?? (config.isConsumptionBar ? "h-10" : isSubRow ? "h-5" : "h-8");
  // Total row gets a top border to visually separate it from the sub-rows above.
  const borderClass = !isSubRow && !config.isConsumptionBar && !config.noBorder ? "border-t border-border/60" : "";

  return (
    <>
      <div
        className={`${rowH} px-3 flex items-center bg-background text-[11px] text-foreground/75 sticky left-0 z-10 ${borderClass}`}
        role="rowheader"
      >
        {config.operator && (
          <span className="mr-1.5 w-3 shrink-0 text-center text-[10px] text-muted-foreground/50 font-mono select-none">
            {config.operator}
          </span>
        )}
        <span className={config.operator === "=" ? "font-semibold" : ""}>{rowLabel}</span>
      </div>
      <div className={`${rowH} bg-transparent ${borderClass}`} aria-hidden="true" />
      {activeMonths.map((month) =>
        config.isConsumptionBar ? (
          <ConsumptionBarCell key={month} month={month} config={config} />
        ) : (
          <SummaryHeaderCell key={month} month={month} config={config} />
        )
      )}
    </>
  );
}

function SummaryHeaderCell({
  month,
  config,
}: {
  month: string;
  config: SummaryRowConfig;
}) {
  const { data, error } = useEffectiveMonthData(month);
  const isSubRow = config.isSubRow;
  const rowH = config.rowHeight ?? (isSubRow ? "h-6" : "h-8");
  const borderClass = !isSubRow && !config.isConsumptionBar && !config.noBorder ? "border-t border-border/60" : "";

  if (error || !data) return <div className={`${rowH} bg-transparent ${borderClass}`} />;

  const value = config.getValue(data.summary);
  const dynamicLabel = config.dynamicLabel
    ? config.dynamicLabel(data.summary)
    : null;
  const colorClass = config.colorClass
    ? config.colorClass(data.summary)
    : "text-foreground/75";

  if (config.isHoldCell) {
    return (
      <div
        className={`${rowH} px-1.5 flex items-center gap-1 bg-transparent font-sans tabular-nums leading-tight text-[11px] ${borderClass} ${colorClass}`}
      >
        <HoldToggleButton
          month={month}
          forNextMonth={data.summary.forNextMonth}
          toBudget={data.summary.toBudget}
        />
        <div className="flex flex-col items-end flex-1 min-w-0">
          {dynamicLabel && (
            <span className="text-[9px] font-semibold leading-none mb-0.5">
              {dynamicLabel}
            </span>
          )}
          <span>{fmtSummary(value)}</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${rowH} px-2 flex flex-col items-end justify-center bg-transparent font-sans tabular-nums leading-tight text-[11px] ${borderClass} ${colorClass}`}
    >
      {dynamicLabel && (
        <span className="text-[9px] font-semibold leading-none mb-0.5">
          {dynamicLabel}
        </span>
      )}
      <span>{fmtSummary(value)}</span>
    </div>
  );
}

// ─── Section total row ─────────────────────────────────────────────────────────

type SectionFilter = "expense" | "income";

const SECTION_LABELS: Record<SectionFilter, Record<CellView, string>> = {
  expense: {
    budgeted: "Total Budgeted Expenses",
    spent:    "Total Spent Expenses",
    balance:  "Total Expense Variance",
  },
  income: {
    budgeted: "Total Budgeted Income",
    spent:    "Total Received Income",
    balance:  "Total Income Variance",
  },
};

function SectionTotalCell({
  month,
  filter,
  cellView,
  budgetMode,
}: {
  month: string;
  filter: SectionFilter;
  cellView: CellView;
  budgetMode: BudgetMode;
}) {
  const { data } = useEffectiveMonthData(month);
  if (!data) {
    return (
      <div className="h-8 bg-muted/15 border-b border-border/50 animate-pulse" />
    );
  }

  // In Envelope mode the income section always sums actuals (received).
  const effectiveView =
    budgetMode === "envelope" && filter === "income" ? "spent" : cellView;

  let total: number;

  if (budgetMode === "tracking") {
    // Tracking: sum category-level values, excluding hidden groups and hidden cats.
    const cats = data.groupOrder
      .map((id) => data.groupsById[id]!)
      .filter((g) => !g.hidden && (filter === "expense" ? !g.isIncome : g.isIncome))
      .flatMap((g) =>
        g.categoryIds
          .map((catId) => data.categoriesById[catId])
          .filter((c): c is NonNullable<typeof c> => !!c && !c.hidden)
      );
    total =
      effectiveView === "spent"
        ? cats.reduce((sum, c) => sum + c.actuals, 0)
        : effectiveView === "balance"
        ? cats.reduce((sum, c) => sum + c.balance, 0)
        : cats.reduce((sum, c) => sum + c.budgeted, 0);
  } else {
    // Envelope: group-level aggregates include all hidden rows.
    const groups = data.groupOrder
      .map((id) => data.groupsById[id]!)
      .filter((g) => (filter === "expense" ? !g.isIncome : g.isIncome));
    total =
      effectiveView === "spent"
        ? groups.reduce((sum, g) => sum + g.actuals, 0)
        : effectiveView === "balance"
        ? groups.reduce((sum, g) => sum + g.balance, 0)
        : groups.reduce((sum, g) => sum + g.budgeted, 0);
  }

  return (
    <div className="h-8 px-2 flex items-center justify-end bg-muted/15 border-b border-border/50 text-xs font-sans tabular-nums font-semibold text-foreground">
      {fmt(total)}
    </div>
  );
}

function SectionTotalRow({
  filter,
  cellView,
  budgetMode,
  activeMonths,
}: {
  filter: SectionFilter;
  cellView: CellView;
  budgetMode: BudgetMode;
  activeMonths: string[];
}) {
  // In Envelope mode the income section always uses the "received" label.
  const effectiveView =
    budgetMode === "envelope" && filter === "income" ? "spent" : cellView;
  const label = SECTION_LABELS[filter][effectiveView];
  return (
    <>
      <div
        className="h-8 px-3 flex items-center bg-background border-b border-border/50 text-xs font-semibold text-foreground/80 sticky left-0 z-10"
        role="rowheader"
      >
        {label}
      </div>
      <div
        className="h-8 bg-muted/15 border-b border-border/50"
        aria-hidden="true"
      />
      {activeMonths.map((month) => (
        <SectionTotalCell key={month} month={month} filter={filter} cellView={cellView} budgetMode={budgetMode} />
      ))}
    </>
  );
}

// ─── Group aggregate cell ──────────────────────────────────────────────────────

function GroupMonthAggregate({
  month,
  groupId,
  cellView,
  budgetMode,
  isDimmed,
  isSelected,
  onFocus,
  onNavigate,
}: {
  month: string;
  groupId: string;
  cellView: CellView;
  budgetMode: BudgetMode;
  isDimmed?: boolean;
  isSelected?: boolean;
  onFocus?: () => void;
  onNavigate?: (dir: NavDirection) => void;
}) {
  const { data, error } = useEffectiveMonthData(month);
  const group = data?.groupsById[groupId];

  const baseClass =
    "h-7 border-r border-b border-border bg-[#F7F8FA] dark:bg-zinc-800 dark:border-zinc-700";
  const dimClass = isDimmed ? " opacity-50" : "";

  if (error) return <div className={`${baseClass}${dimClass}`} />;
  if (!group) return <div className={`${baseClass} animate-pulse${dimClass}`} />;

  // In Envelope mode, income groups always show actuals (received).
  const effectiveView =
    budgetMode === "envelope" && group.isIncome ? "spent" : cellView;

  let displayValue: number;
  if (budgetMode === "tracking") {
    // Tracking: sum non-hidden categories only.
    const cats = group.categoryIds
      .map((id) => data?.categoriesById[id])
      .filter((c): c is NonNullable<typeof c> => !!c && !c.hidden);
    displayValue =
      effectiveView === "spent"
        ? cats.reduce((sum, c) => sum + c.actuals, 0)
        : effectiveView === "balance"
        ? cats.reduce((sum, c) => sum + c.balance, 0)
        : cats.reduce((sum, c) => sum + c.budgeted, 0);
  } else {
    // Envelope: group-level aggregates include all hidden rows.
    displayValue =
      effectiveView === "spent"
        ? group.actuals
        : effectiveView === "balance"
        ? group.balance
        : group.budgeted;
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowUp") { e.preventDefault(); onNavigate?.("up"); }
    else if (e.key === "ArrowDown") { e.preventDefault(); onNavigate?.("down"); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); onNavigate?.("left"); }
    else if (e.key === "ArrowRight") { e.preventDefault(); onNavigate?.("right"); }
    else if (e.key === "Tab") { e.preventDefault(); onNavigate?.(e.shiftKey ? "shift-tab" : "tab"); }
  };

  return (
    <div
      className={`${baseClass}${dimClass} px-2 flex items-center justify-end text-xs font-sans tabular-nums text-black dark:text-zinc-200 cursor-default outline-none${isSelected ? " ring-2 ring-inset ring-foreground/80" : ""}`}
      role="gridcell"
      tabIndex={0}
      aria-selected={isSelected}
      aria-label={`${group.name} total for ${month}: ${fmt(displayValue)}`}
      title={`Budgeted: ${fmt(group.budgeted)} | Actuals: ${fmt(Math.abs(group.actuals))} | Balance: ${fmt(group.balance)}`}
      data-group-id={groupId}
      data-group-month={month}
      onClick={onFocus}
      onFocus={onFocus}
      onKeyDown={handleKeyDown}
    >
      {fmt(displayValue)}
    </div>
  );
}

// ─── Main grid ─────────────────────────────────────────────────────────────────

/**
 * Budget grid — CSS grid layout.
 *
 * Column layout: [category label (flex)] [notes (32 px)] [month columns…]
 *
 * Sections:
 *   1. Mode-specific summary rows
 *   2. Expense groups (isIncome = false) with "Total Budgeted Expenses" header
 *   3. Income groups (isIncome = true) with "Total Budgeted Income" header
 *
 * Each group can be collapsed/expanded via a chevron button.
 * Month column headers show a status dot (green / amber / gray).
 */
export function BudgetGrid({
  activeMonths,
  availableMonths,
  budgetMode,
  cellView,
  selection,
  groupSelection,
  collapsedGroups,
  onToggleCollapse,
  showHidden,
  onCellFocus,
  onCellRangeSelect,
  onCellNavigate,
  onCellContextMenu,
  onGroupFocus,
  onGroupNavigate,
  onClearSelection,
}: Props) {
  const firstMonth = activeMonths[0] ?? null;
  const { data: firstMonthData, isLoading, error } = useMonthData(firstMonth);

  const isDraggingRef = useRef<boolean>(false);

  // Build allCategories in visual order: expense groups first, income groups after.
  // This ensures selection index bounds match the rendered order in the grid.
  // When showHidden=false, hidden groups and hidden categories are excluded.
  const allCategories = useMemo(() => {
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

  const categoryIndexMap = useMemo(
    () => new Map(allCategories.map((c, i) => [c.id, i] as [string, number])),
    [allCategories]
  );

  const selectionBounds = useMemo<SelectionBounds | null>(() => {
    if (!selection) return null;
    const anchorCatIdx = categoryIndexMap.get(selection.anchorCategoryId) ?? -1;
    const focusCatIdx = categoryIndexMap.get(selection.focusCategoryId) ?? -1;
    const anchorMonthIdx = activeMonths.indexOf(selection.anchorMonth);
    const focusMonthIdx = activeMonths.indexOf(selection.focusMonth);
    if (
      anchorCatIdx === -1 ||
      focusCatIdx === -1 ||
      anchorMonthIdx === -1 ||
      focusMonthIdx === -1
    )
      return null;
    return {
      minCatIdx: Math.min(anchorCatIdx, focusCatIdx),
      maxCatIdx: Math.max(anchorCatIdx, focusCatIdx),
      minMonthIdx: Math.min(anchorMonthIdx, focusMonthIdx),
      maxMonthIdx: Math.max(anchorMonthIdx, focusMonthIdx),
    };
  }, [selection, categoryIndexMap, activeMonths]);

  if (!firstMonth) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm p-8">
        No months selected
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="flex-1 flex items-center justify-center"
        aria-busy="true"
        aria-label="Loading budget data…"
      >
        <div className="text-sm text-muted-foreground">Loading budget data…</div>
      </div>
    );
  }

  if (error || !firstMonthData) {
    return (
      <div
        className="flex-1 flex items-center justify-center text-destructive text-sm p-8"
        role="alert"
      >
        No budget data available for this period. Use the navigation above to
        find months with data.
      </div>
    );
  }

  const { groupOrder, groupsById, categoriesById } = firstMonthData;
  // When !showHidden, hidden groups are omitted entirely.
  // When showHidden, hidden groups are rendered but dimmed.
  const expenseGroups = groupOrder
    .map((id) => groupsById[id]!)
    .filter((g) => !g.isIncome && (showHidden || !g.hidden));
  const incomeGroups = groupOrder
    .map((id) => groupsById[id]!)
    .filter((g) => g.isIncome && (showHidden || !g.hidden));

  const summaryRows =
    budgetMode === "tracking"
      ? TRACKING_SUMMARY_ROWS
      : budgetMode === "envelope"
      ? ENVELOPE_SUMMARY_ROWS
      : [];

  const gridStyle: React.CSSProperties = {
    display: "grid",
    // Category label: wider flexible column; notes: 32 px; months: narrower
    gridTemplateColumns: `minmax(180px, 1fr) 32px repeat(${activeMonths.length}, minmax(69px, 94px))`,
  };

  const sharedGroupProps = {
    activeMonths,
    budgetMode,
    cellView,
    selection,
    groupSelection,
    selectionBounds,
    categoryIndexMap,
    categoriesById,
    isDraggingRef,
    showHidden,
    onCellFocus,
    onCellRangeSelect,
    onCellNavigate,
    onCellContextMenu,
    onGroupFocus,
    onGroupNavigate,
  };

  return (
    <div
      role="grid"
      aria-label="Budget grid"
      aria-colcount={activeMonths.length + 2}
      style={gridStyle}
      className="flex-1 text-sm border-t border-border/50"
      onClick={(e) => {
        if (!(e.target as Element).closest("[data-category-id],[data-group-id]")) {
          onClearSelection?.();
        }
      }}
    >
      {/* ── Column headers ── */}
      <div
        className="h-8 px-3 flex items-center border-b-2 border-border bg-muted text-xs font-bold text-foreground sticky left-0 top-0 z-20"
        role="columnheader"
        aria-label="Category"
      >
        Category
      </div>
      <div
        className="h-8 flex items-center justify-center border-b-2 border-border bg-muted sticky top-0 z-10"
        role="columnheader"
        aria-label="Notes"
      >
        <StickyNote
          className="h-3.5 w-3.5 text-muted-foreground/60"
          aria-hidden="true"
        />
      </div>
      {activeMonths.map((month) => (
        <MonthColumnHeader
          key={month}
          month={month}
          availableMonths={availableMonths}
        />
      ))}

      {/* ── Section 1: Summary rows ── */}
      {summaryRows.map((config, i) => (
        <SummaryHeaderRow
          key={`summary-${i}`}
          config={config}
          activeMonths={activeMonths}
        />
      ))}

      {/* Separator between summary and data */}
      {summaryRows.length > 0 && (
        <div
          style={{ gridColumn: `1 / ${activeMonths.length + 3}` }}
          className="h-px bg-border/60"
          aria-hidden="true"
        />
      )}

      {/* ── Section 2: Expense groups ── */}
      {expenseGroups.length > 0 && (
        <>
          <SectionTotalRow
            filter="expense"
            cellView={cellView}
            budgetMode={budgetMode}
            activeMonths={activeMonths}
          />
          {expenseGroups.map((group) => (
            <BudgetGridGroupRows
              key={group.id}
              group={group}
              collapsed={collapsedGroups.has(group.id)}
              onToggleCollapse={() => onToggleCollapse(group.id)}
              {...sharedGroupProps}
            />
          ))}
        </>
      )}

      {/* Separator between expense and income sections */}
      {expenseGroups.length > 0 && incomeGroups.length > 0 && (
        <div
          style={{ gridColumn: `1 / ${activeMonths.length + 3}` }}
          className="h-0.5 bg-border/60"
          aria-hidden="true"
        />
      )}

      {/* ── Section 3: Income groups ── */}
      {incomeGroups.length > 0 && (
        <>
          <SectionTotalRow
            filter="income"
            cellView={cellView}
            budgetMode={budgetMode}
            activeMonths={activeMonths}
          />
          {incomeGroups.map((group) => (
            <BudgetGridGroupRows
              key={group.id}
              group={group}
              collapsed={collapsedGroups.has(group.id)}
              onToggleCollapse={() => onToggleCollapse(group.id)}
              {...sharedGroupProps}
            />
          ))}
        </>
      )}
    </div>
  );
}

// ─── Group rows ────────────────────────────────────────────────────────────────

type GroupRowsProps = {
  group: LoadedGroup;
  collapsed: boolean;
  onToggleCollapse: () => void;
  activeMonths: string[];
  budgetMode: BudgetMode;
  cellView: CellView;
  selection: BudgetCellSelection | null;
  selectionBounds: SelectionBounds | null;
  categoryIndexMap: Map<string, number>;
  /** First-month categoriesById for category metadata (name, isIncome, etc.). */
  categoriesById: Record<string, LoadedCategory>;
  isDraggingRef: { current: boolean };
  showHidden: boolean;
  groupSelection?: Props["groupSelection"];
  onCellFocus: Props["onCellFocus"];
  onCellRangeSelect: Props["onCellRangeSelect"];
  onCellNavigate?: Props["onCellNavigate"];
  onCellContextMenu?: Props["onCellContextMenu"];
  onGroupFocus?: Props["onGroupFocus"];
  onGroupNavigate?: Props["onGroupNavigate"];
};

/**
 * Group header row + (when not collapsed) one category row per category.
 * Light #F7F8FA background with black text; dark mode uses zinc-800.
 */
function BudgetGridGroupRows({
  group,
  collapsed,
  onToggleCollapse,
  activeMonths,
  budgetMode,
  cellView,
  selection,
  selectionBounds,
  categoryIndexMap,
  categoriesById,
  isDraggingRef,
  showHidden,
  groupSelection,
  onCellFocus,
  onCellRangeSelect,
  onCellNavigate,
  onCellContextMenu,
  onGroupFocus,
  onGroupNavigate,
}: GroupRowsProps) {
  // When showHidden=true and this group is hidden, dim all its rows.
  const groupDimmed = showHidden && group.hidden;
  const groupDimClass = groupDimmed ? " opacity-50" : "";

  return (
    <>
      {/* Group header — light bg, black text */}
      <div
        className={`h-7 px-2 flex items-center border-r border-b border-border bg-[#F7F8FA] dark:bg-zinc-800 dark:border-zinc-700 text-xs font-semibold text-black dark:text-zinc-100 sticky left-0 z-10${groupDimClass}`}
        role="rowheader"
        aria-label={`Category group: ${group.name}`}
        aria-expanded={!collapsed}
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          className="mr-1.5 shrink-0 text-black/40 dark:text-zinc-500 hover:text-black dark:hover:text-zinc-100 transition-colors"
          aria-label={collapsed ? `Expand ${group.name}` : `Collapse ${group.name}`}
        >
          {collapsed ? (
            <ChevronRight className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
        <span className="truncate">{group.name}</span>
      </div>

      {/* Notes column for group row */}
      <div
        className={`h-7 flex items-center justify-center border-r border-b border-border bg-[#F7F8FA] dark:bg-zinc-800 dark:border-zinc-700${groupDimClass}`}
      >
        <NoteCell
          entityId={group.id}
          entityLabel={group.name}
          entityTypeLabel="Category group"
        />
      </div>

      {/* Group aggregate cells */}
      {activeMonths.map((month) => (
        <GroupMonthAggregate
          key={month}
          month={month}
          groupId={group.id}
          cellView={cellView}
          budgetMode={budgetMode}
          isDimmed={groupDimmed}
          isSelected={groupSelection?.groupId === group.id && groupSelection?.month === month}
          onFocus={() => onGroupFocus?.(group.id, month)}
          onNavigate={(dir) => onGroupNavigate?.(group.id, month, dir)}
        />
      ))}

      {/* Category rows — hidden when collapsed */}
      {!collapsed &&
        group.categoryIds.map((catId) => {
          const cat = categoriesById[catId];
          if (!cat) return null;
          // Skip hidden cats when not showing hidden; dim them when showing hidden.
          if (!showHidden && cat.hidden) return null;
          const catDimmed = groupDimmed || (showHidden && cat.hidden);
          const catDimClass = catDimmed ? " opacity-50" : "";

          return (
            <div
              key={cat.id}
              style={{ display: "contents" }}
              role="row"
              aria-label={cat.name}
            >
              {/* Category label */}
              <div
                className={`h-7 px-4 flex items-center border-r border-b border-border/50 text-xs truncate sticky left-0 bg-background${catDimClass}`}
                role="rowheader"
                aria-label={`Category: ${cat.name}`}
              >
                {cat.name}
              </div>

              {/* Notes column */}
              <div
                className={`h-7 flex items-center justify-center border-r border-b border-border/50 bg-background${catDimClass}`}
              >
                <NoteCell
                  entityId={cat.id}
                  entityLabel={cat.name}
                  entityTypeLabel="Category"
                />
              </div>

              {/* Budget cells */}
              {activeMonths.map((month, monthIdx) => {
                const catIdx = categoryIndexMap.get(cat.id) ?? -1;
                const isAnchor =
                  selection?.anchorCategoryId === cat.id &&
                  selection?.anchorMonth === month;
                const isSelected = isCellSelected(catIdx, monthIdx, selectionBounds);

                return (
                  <BudgetCell
                    key={`${month}:${cat.id}`}
                    category={cat}
                    month={month}
                    budgetMode={budgetMode}
                    cellView={cellView}
                    isSelected={isSelected}
                    isAnchor={isAnchor}
                    isDraggingRef={isDraggingRef}
                    isDimmed={catDimmed}
                    onFocus={onCellFocus}
                    onRangeSelect={onCellRangeSelect}
                    onNavigate={(dir) => onCellNavigate?.(cat.id, month, dir)}
                    onContextMenuRequest={onCellContextMenu}
                  />
                );
              })}
            </div>
          );
        })}
    </>
  );
}

function isCellSelected(
  catIdx: number,
  monthIdx: number,
  bounds: SelectionBounds | null
): boolean {
  if (!bounds || catIdx === -1 || monthIdx === -1) return false;
  return (
    catIdx >= bounds.minCatIdx &&
    catIdx <= bounds.maxCatIdx &&
    monthIdx >= bounds.minMonthIdx &&
    monthIdx <= bounds.maxMonthIdx
  );
}
