"use client";

import { useMemo } from "react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useBudgetEditsStore } from "@/store/budgetEdits";
import { useMonthData } from "../hooks/useMonthData";
import { useEffectiveMonthData } from "../hooks/useEffectiveMonthData";
import { useAvailableMonths } from "../hooks/useAvailableMonths";
import { useBudgetMode } from "../hooks/useBudgetMode";
import type {
  BudgetCellKey,
  BudgetMode,
  LoadedCategory,
  LoadedMonthState,
  StagedBudgetEdit,
} from "../types";

// ─── Format helpers ────────────────────────────────────────────────────────────

function fmtAmount(minor: number): string {
  const sign = minor < 0 ? "−" : "";
  return `${sign}${(Math.abs(minor) / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtMonthLabel(month: string): string {
  const [yearStr, moStr] = month.split("-");
  const year = parseInt(yearStr ?? "2000", 10);
  const mo = parseInt(moStr ?? "1", 10);
  return new Date(year, mo - 1, 1).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
}

function getPrevMonth(month: string): string {
  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr ?? "2000", 10);
  const mo = parseInt(monthStr ?? "1", 10);
  const prevDate = new Date(year, mo - 2, 1);
  return `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`;
}

// ─── MetricRow helper ──────────────────────────────────────────────────────────

function MetricRow({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className="text-muted-foreground shrink-0 text-[11px]">{label}</span>
      <span
        className={`font-sans tabular-nums text-right text-[11px] ${valueClass ?? "text-foreground"}`}
      >
        {value}
      </span>
    </div>
  );
}

// ─── Section 1: Selected cell details ─────────────────────────────────────────

function CellDetailsSection({
  selectedMonth,
  selectedCategoryId,
  edits,
}: {
  selectedMonth: string | null;
  selectedCategoryId: string | null;
  edits: Record<BudgetCellKey, StagedBudgetEdit>;
}) {
  const { data: monthData } = useMonthData(selectedMonth);
  const prevMonth = selectedMonth ? getPrevMonth(selectedMonth) : null;
  const { data: prevMonthData } = useMonthData(prevMonth);

  if (!selectedMonth || !selectedCategoryId) {
    return (
      <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
        <div className="mb-1">No cell selected</div>
        <div className="text-[10px] text-muted-foreground/50">
          Click a cell to inspect
        </div>
      </div>
    );
  }

  const category = monthData?.categoriesById[selectedCategoryId];
  const prevCategory = prevMonthData?.categoriesById[selectedCategoryId];

  const key: BudgetCellKey = `${selectedMonth}:${selectedCategoryId}`;
  const stagedEdit = edits[key];
  const displayBudgeted =
    stagedEdit != null ? stagedEdit.nextBudgeted : (category?.budgeted ?? 0);

  const monthLabel = fmtMonthLabel(selectedMonth);

  return (
    <div className="px-3 py-2">
      {/* Category header */}
      {category ? (
        <div className="mb-2 pb-2 border-b border-border/40">
          <div className="font-semibold text-sm truncate leading-tight">
            {category.name}
          </div>
          <div className="text-[11px] text-muted-foreground truncate mt-0.5">
            {category.groupName}
          </div>
          <div className="text-[10px] text-muted-foreground/60 mt-1 font-sans tabular-nums">
            {monthLabel}
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground text-xs mb-2">
          {monthData ? "Category not found" : "Loading…"}
        </div>
      )}

      {/* Metrics */}
      {category && (
        <div className="space-y-1.5">
          <MetricRow
            label="Budgeted"
            value={fmtAmount(displayBudgeted)}
            valueClass={
              stagedEdit
                ? "text-amber-700 dark:text-amber-400 font-semibold"
                : undefined
            }
          />
          <MetricRow label="Actuals" value={fmtAmount(category.actuals)} />
          <MetricRow
            label="Balance"
            value={fmtAmount(category.balance)}
            valueClass={
              category.balance < 0
                ? "text-destructive"
                : category.balance > 0
                ? "text-emerald-700 dark:text-emerald-400"
                : undefined
            }
          />
          {category.carryover && (
            <MetricRow label="Carryover" value="On" />
          )}
          {prevCategory !== undefined && (
            <MetricRow
              label="Prev month"
              value={fmtAmount(prevCategory.budgeted)}
            />
          )}

          {/* Staged diff rows */}
          {stagedEdit && (
            <>
              <div className="h-px bg-border/50 my-1" />
              <MetricRow
                label="Was"
                value={fmtAmount(stagedEdit.previousBudgeted)}
              />
              <MetricRow
                label="Diff"
                value={`${stagedEdit.nextBudgeted - stagedEdit.previousBudgeted >= 0 ? "+" : ""}${fmtAmount(stagedEdit.nextBudgeted - stagedEdit.previousBudgeted)}`}
                valueClass={
                  stagedEdit.nextBudgeted - stagedEdit.previousBudgeted >= 0
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-destructive"
                }
              />
              {stagedEdit.saveError && (
                <div className="text-[10px] text-destructive mt-0.5">
                  {stagedEdit.saveError}
                </div>
              )}
            </>
          )}
        </div>
      )}

    
    </div>
  );
}

// ─── Section 2: Staged changes grouped by month ────────────────────────────────

function StagedChangesSection({
  edits,
  allCategories,
}: {
  edits: Record<BudgetCellKey, StagedBudgetEdit>;
  allCategories: LoadedCategory[];
}) {
  const editList = Object.values(edits);

  const byMonth = useMemo(() => {
    const grouped: Record<string, StagedBudgetEdit[]> = {};
    for (const edit of editList) {
      if (!grouped[edit.month]) grouped[edit.month] = [];
      grouped[edit.month]!.push(edit);
    }
    return grouped;
  }, [editList]);

  const months = useMemo(() => Object.keys(byMonth).sort(), [byMonth]);

  if (editList.length === 0) {
    return (
      <div className="px-3 py-4 text-[11px] text-muted-foreground text-center">
        No staged changes
      </div>
    );
  }

  return (
    <div className="px-3 py-2">
      <p className="mb-2 text-[10px] text-muted-foreground">
        {editList.length} pending change{editList.length !== 1 ? "s" : ""} in{" "}
        {months.length} month{months.length !== 1 ? "s" : ""}
      </p>

      {months.map((month) => {
        const monthEdits = (byMonth[month] ?? []).slice().sort((a, b) => {
          const nameA =
            allCategories.find((c) => c.id === a.categoryId)?.name ?? a.categoryId;
          const nameB =
            allCategories.find((c) => c.id === b.categoryId)?.name ?? b.categoryId;
          return nameA.localeCompare(nameB);
        });

        return (
          <div key={month} className="mb-3">
            <p className="text-[11px] font-semibold text-foreground/80 mb-1">
              {fmtMonthLabel(month)}
            </p>
            {monthEdits.map((edit) => {
              const catName =
                allCategories.find((c) => c.id === edit.categoryId)?.name ??
                edit.categoryId.slice(0, 8);
              const delta = edit.nextBudgeted - edit.previousBudgeted;
              const deltaStr = `${delta >= 0 ? "+" : ""}${fmtAmount(delta)}`;
              const deltaClass =
                delta >= 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-destructive";

              return (
                <div
                  key={`${edit.month}:${edit.categoryId}`}
                  className="flex items-baseline justify-between gap-1 py-0.5"
                >
                  <span
                    className="truncate text-[10px] text-foreground/80 min-w-0 flex-1"
                    title={catName}
                  >
                    {catName}
                  </span>
                  <span
                    className={`font-sans tabular-nums text-[10px] shrink-0 ${deltaClass}`}
                  >
                    {deltaStr}
                  </span>
                  {edit.saveError && (
                    <span
                      className="text-[9px] text-destructive shrink-0"
                      title={edit.saveError}
                    >
                      !
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Section 1b: Selected group details ───────────────────────────────────────

function GroupDetailsSection({
  selectedMonth,
  selectedGroupId,
  edits,
}: {
  selectedMonth: string | null;
  selectedGroupId: string | null;
  edits: Record<BudgetCellKey, StagedBudgetEdit>;
}) {
  const { data: effectiveData } = useEffectiveMonthData(selectedMonth);
  const { data: serverData } = useMonthData(selectedMonth);
  const prevMonth = selectedMonth ? getPrevMonth(selectedMonth) : null;
  const { data: prevMonthData } = useMonthData(prevMonth);

  if (!selectedMonth || !selectedGroupId) return null;

  const effectiveGroup = effectiveData?.groupsById[selectedGroupId];
  const serverGroup = serverData?.groupsById[selectedGroupId];
  const prevGroup = prevMonthData?.groupsById[selectedGroupId];
  const group = effectiveGroup ?? serverGroup;

  if (!group) {
    return (
      <div className="px-3 py-2 text-[11px] text-muted-foreground">
        {effectiveData ? "Group not found" : "Loading…"}
      </div>
    );
  }

  // Determine if any staged edits exist for categories in this group+month.
  const groupCatIds = new Set(group.categoryIds);
  const hasEdits = Object.keys(edits).some((key) => {
    const sep = key.indexOf(":");
    return sep !== -1 && key.slice(0, sep) === selectedMonth && groupCatIds.has(key.slice(sep + 1));
  });

  const wasBudgeted = serverGroup?.budgeted ?? group.budgeted;
  const diff = group.budgeted - wasBudgeted;

  return (
    <div className="px-3 py-2">
      {/* Group header */}
      <div className="mb-2 pb-2 border-b border-border/40">
        <div className="font-semibold text-sm truncate leading-tight">
          {group.name}
        </div>
        <div className="text-[11px] text-muted-foreground truncate mt-0.5">
          {group.isIncome ? "Income group" : "Expense group"}
        </div>
        <div className="text-[10px] text-muted-foreground/60 mt-1 font-sans tabular-nums">
          {fmtMonthLabel(selectedMonth)}
        </div>
      </div>

      {/* Metrics */}
      <div className="space-y-1.5">
        <MetricRow label="Budgeted" value={fmtAmount(group.budgeted)} />
        <MetricRow label="Actuals" value={fmtAmount(Math.abs(group.actuals))} />
        <MetricRow
          label="Balance"
          value={fmtAmount(group.balance)}
          valueClass={
            group.balance < 0
              ? "text-destructive"
              : group.balance > 0
              ? "text-emerald-700 dark:text-emerald-400"
              : undefined
          }
        />
        {prevGroup !== undefined && (
          <MetricRow label="Prev month" value={fmtAmount(prevGroup.budgeted)} />
        )}

        {hasEdits && (
          <>
            <div className="h-px bg-border/50 my-1" />
            <MetricRow label="Was" value={fmtAmount(wasBudgeted)} />
            <MetricRow
              label="Diff"
              value={`${diff >= 0 ? "+" : ""}${fmtAmount(diff)}`}
              valueClass={
                diff >= 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-destructive"
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

// ─── Section 3: Year summary ───────────────────────────────────────────────────

function fmtYearRange(displayMonths: string[]): string {
  const first = displayMonths[0];
  const last = displayMonths[displayMonths.length - 1];
  if (!first || !last) return "";
  const [y1, m1] = first.split("-");
  const [y2, m2] = last.split("-");
  const year1 = parseInt(y1 ?? "2026", 10);
  const mo1 = parseInt(m1 ?? "1", 10);
  const year2 = parseInt(y2 ?? "2026", 10);
  const mo2 = parseInt(m2 ?? "12", 10);
  if (year1 === year2) return String(year1);
  const d1 = new Date(year1, mo1 - 1, 1);
  const d2 = new Date(year2, mo2 - 1, 1);
  const fmt = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" });
  return `${fmt.format(d1)} – ${fmt.format(d2)}`;
}

function SparkRow({
  label,
  values,
  barClass,
  balanceMode = false,
}: {
  label: string;
  values: (number | null)[];
  barClass?: string;
  balanceMode?: boolean;
}) {
  const max = Math.max(0, ...values.map((v) => (v !== null ? Math.abs(v) : 0)));

  return (
    <div>
      <span className="text-[10px] text-muted-foreground mb-1 block">{label}</span>
      <div className="flex items-end gap-px h-5">
        {values.map((v, i) => {
          if (v === null) {
            return (
              <div key={i} className="flex-1 h-[2px] rounded-[1px] bg-muted/40" />
            );
          }
          const absV = Math.abs(v);
          const pct = max > 0 ? absV / max : 0;
          const heightPx = Math.max(2, Math.round(pct * 20));
          const cls = balanceMode
            ? v >= 0
              ? "bg-emerald-500/60 dark:bg-emerald-400/50"
              : "bg-destructive/60"
            : (barClass ?? "bg-primary/60");
          return (
            <div key={i} className="flex-1 flex flex-col justify-end h-5">
              <div className={`rounded-[1px] ${cls}`} style={{ height: `${heightPx}px` }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

type MonthEntry = { month: string; state: LoadedMonthState };

function YearSummaryDisplay({
  displayMonths,
  monthsData,
  budgetMode,
  isLoading,
}: {
  displayMonths: string[];
  monthsData: MonthEntry[];
  budgetMode: BudgetMode;
  isLoading: boolean;
}) {
  const isEnvelope = budgetMode === "envelope";
  const availableSet = useMemo(
    () => new Set(monthsData.map((d) => d.month)),
    [monthsData]
  );

  const yearRangeLabel = useMemo(() => fmtYearRange(displayMonths), [displayMonths]);

  const totals = useMemo(() => {
    let expBudgeted = 0;
    let expSpent = 0;
    let incReceived = 0;
    let incBudgeted = 0;
    let overallTracking = 0;
    let lastState: LoadedMonthState | undefined;

    for (const { state } of monthsData) {
      expBudgeted += Math.abs(state.summary.totalBudgeted);
      expSpent += Math.abs(state.summary.totalSpent);
      incReceived += state.summary.totalIncome;
      overallTracking += state.summary.totalBalance;
      lastState = state;

      const monthIncBudgeted = Object.values(state.groupsById)
        .filter((g) => g.isIncome)
        .reduce((s, g) => s + g.budgeted, 0);
      incBudgeted += monthIncBudgeted;
    }

    const overall = isEnvelope
      ? (lastState?.summary.toBudget ?? 0)
      : overallTracking;

    return { expBudgeted, expSpent, incReceived, incBudgeted, overall };
  }, [monthsData, isEnvelope]);

  const sparkExpenses = displayMonths.map((m) => {
    if (!availableSet.has(m)) return null;
    return Math.abs(monthsData.find((d) => d.month === m)?.state.summary.totalSpent ?? 0);
  });

  const sparkIncome = displayMonths.map((m) => {
    if (!availableSet.has(m)) return null;
    return monthsData.find((d) => d.month === m)?.state.summary.totalIncome ?? 0;
  });

  const sparkBalance = displayMonths.map((m) => {
    if (!availableSet.has(m)) return null;
    const entry = monthsData.find((d) => d.month === m);
    if (!entry) return null;
    return isEnvelope
      ? entry.state.summary.toBudget
      : entry.state.summary.totalBalance;
  });

  if (isLoading && monthsData.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (monthsData.length === 0) {
    return (
      <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
        No data available
      </div>
    );
  }

  const { overall } = totals;

  return (
    <div className="px-3 py-2 space-y-3">
      {/* Header */}
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Year Summary
        </p>
        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{yearRangeLabel}</p>
      </div>

      {/* Expenses */}
      <div>
        <p className="text-[10px] font-semibold text-foreground/70 mb-1">Expenses</p>
        <div className="space-y-1">
          <MetricRow label="Budgeted" value={fmtAmount(totals.expBudgeted)} />
          <MetricRow label="Spent" value={fmtAmount(totals.expSpent)} />
        </div>
      </div>

      {/* Income */}
      <div>
        <p className="text-[10px] font-semibold text-foreground/70 mb-1">Income</p>
        <div className="space-y-1">
          {!isEnvelope && (
            <MetricRow label="Budgeted" value={fmtAmount(totals.incBudgeted)} />
          )}
          <MetricRow label="Received" value={fmtAmount(totals.incReceived)} />
        </div>
      </div>

      {/* Overall result */}
      <div className="border-t border-border/40 pt-2">
        <div className="flex justify-between items-baseline gap-2">
          <span className="text-[11px] font-semibold text-foreground/80">
            {isEnvelope ? "To Budget" : "Net Balance"}
          </span>
          <span
            className={`font-sans tabular-nums text-right text-sm font-semibold ${
              overall > 0
                ? "text-emerald-700 dark:text-emerald-400"
                : overall < 0
                ? "text-destructive"
                : "text-foreground"
            }`}
          >
            {fmtAmount(overall)}
          </span>
        </div>
      </div>

      {/* Monthly Trend sparkbars */}
      <div className="border-t border-border/40 pt-2 space-y-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Monthly Trend
        </p>
        <SparkRow
          label="Expenses"
          values={sparkExpenses}
          barClass="bg-destructive/60"
        />
        <SparkRow
          label="Income"
          values={sparkIncome}
          barClass="bg-emerald-500/60 dark:bg-emerald-400/50"
        />
        <SparkRow label="Balance" values={sparkBalance} balanceMode />
      </div>
    </div>
  );
}

function YearSummaryDataLoader({
  displayMonths,
  availableMonths,
}: {
  displayMonths: string[];
  availableMonths: string[];
}) {
  const { data: budgetModeRaw } = useBudgetMode();
  const budgetMode: BudgetMode = budgetModeRaw ?? "unidentified";

  const r0  = useEffectiveMonthData(displayMonths[0]  ?? null);
  const r1  = useEffectiveMonthData(displayMonths[1]  ?? null);
  const r2  = useEffectiveMonthData(displayMonths[2]  ?? null);
  const r3  = useEffectiveMonthData(displayMonths[3]  ?? null);
  const r4  = useEffectiveMonthData(displayMonths[4]  ?? null);
  const r5  = useEffectiveMonthData(displayMonths[5]  ?? null);
  const r6  = useEffectiveMonthData(displayMonths[6]  ?? null);
  const r7  = useEffectiveMonthData(displayMonths[7]  ?? null);
  const r8  = useEffectiveMonthData(displayMonths[8]  ?? null);
  const r9  = useEffectiveMonthData(displayMonths[9]  ?? null);
  const r10 = useEffectiveMonthData(displayMonths[10] ?? null);
  const r11 = useEffectiveMonthData(displayMonths[11] ?? null);

  const allResults = [r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11];

  const availableSet = useMemo(() => new Set(availableMonths), [availableMonths]);

  const monthsData = useMemo<MonthEntry[]>(() => {
    const entries: MonthEntry[] = [];
    for (let i = 0; i < displayMonths.length; i++) {
      const month = displayMonths[i]!;
      if (!availableSet.has(month)) continue;
      const state = allResults[i]?.data;
      if (state) entries.push({ month, state });
    }
    return entries;
    // allResults identity is stable across the fixed hook calls — keys never change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayMonths, availableSet, r0, r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11]);

  const isLoading = allResults.some((r) => r.isLoading);

  return (
    <YearSummaryDisplay
      displayMonths={displayMonths}
      monthsData={monthsData}
      budgetMode={budgetMode}
      isLoading={isLoading}
    />
  );
}

// ─── BudgetDraftPanel ──────────────────────────────────────────────────────────

/**
 * Right-side draft panel for the Budget Management page.
 *
 * Self-contained: reads selected cell from budgetEdits.ts uiSelection,
 * budget mode from useBudgetMode, and category data from useMonthData.
 *
 * Rendered by AppShell at the same layout position as DraftPanel (after
 * <main>) when the pathname is /budget-management. No props required.
 *
 * Visually matches the DraftPanel shell (collapsed w-10 strip when idle,
 * expanded aside when active) but shows budget-specific content:
 *   Section 1 — selected cell details (category metrics, staged diff)
 *   Section 2 — all staged changes grouped by month with count summary
 */
export function BudgetDraftPanel() {
  const edits = useBudgetEditsStore((s) => s.edits);
  const { month: selectedMonth, categoryId: selectedCategoryId, groupId: selectedGroupId } =
    useBudgetEditsStore((s) => s.uiSelection);
  const displayMonths = useBudgetEditsStore((s) => s.displayMonths);
  const { data: availableMonths } = useAvailableMonths();

  const totalCount = Object.keys(edits).length;
  const hasPendingEdits = totalCount > 0;
  // Fetch categories for the selected month (or first staged edit's month)
  // to resolve category names in StagedChangesSection.
  const lookupMonth =
    selectedMonth ?? Object.values(edits)[0]?.month ?? null;
  const { data: lookupMonthData } = useMonthData(lookupMonth);
  const allCategories = lookupMonthData
    ? Object.values(lookupMonthData.categoriesById)
    : [];

  const showYearSummary = !selectedCategoryId && !selectedGroupId;

  return (
    <aside className="flex w-[17rem] shrink-0 flex-col border-l border-border bg-background">
      {/* Header */}
      <div className="flex items-center px-3 h-10 shrink-0">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Budget Details
        </span>
      </div>
      <Separator />

      {/* Body */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {showYearSummary ? (
          /* Section 0: Year summary — shown when no cell/group is selected */
          displayMonths.length > 0 ? (
            <YearSummaryDataLoader
              displayMonths={displayMonths}
              availableMonths={availableMonths ?? []}
            />
          ) : (
            <div className="px-3 py-4 text-center text-[11px] text-muted-foreground">
              Loading…
            </div>
          )
        ) : (
          /* Section 1: Cell or group details */
          selectedGroupId ? (
            <GroupDetailsSection
              selectedMonth={selectedMonth}
              selectedGroupId={selectedGroupId}
              edits={edits}
            />
          ) : (
            <CellDetailsSection
              selectedMonth={selectedMonth}
              selectedCategoryId={selectedCategoryId}
              edits={edits}
            />
          )
        )}

        {/* Section 2: Staged changes */}
        {hasPendingEdits && (
          <>
            <Separator />
            <div className="flex items-center justify-between px-3 h-10 shrink-0">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Staged Changes
              </span>
              <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                {totalCount} change{totalCount !== 1 ? "s" : ""}
              </Badge>
            </div>
            <Separator />
            <StagedChangesSection edits={edits} allCategories={allCategories} />
          </>
        )}
      </div>
    </aside>
  );
}
