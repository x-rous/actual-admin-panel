"use client";

import { useRef, useState } from "react";
import { RefreshCw, Download, Upload, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStagedStore } from "@/store/staged";
import { useCategoryGroups } from "../hooks/useCategoryGroups";
import { CategoriesTable } from "./CategoriesTable";

/** Parse a single CSV line respecting double-quoted fields. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { fields.push(current); current = ""; }
      else { current += ch; }
    }
  }
  fields.push(current);
  return fields;
}

function parseBoolean(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

function csvField(value: string): string {
  return value.includes(",") || value.includes('"') || value.includes("\n")
    ? `"${value.replace(/"/g, '""')}"`
    : value;
}

export function CategoriesView() {
  const { isLoading, isError, error, refetch } = useCategoryGroups();
  const importInputRef = useRef<HTMLInputElement>(null);

  // Collapse state lifted here so toolbar can control it
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const stagedGroups = useStagedStore((s) => s.categoryGroups);
  const stagedCats = useStagedStore((s) => s.categories);
  const stageNew = useStagedStore((s) => s.stageNew);
  const pushUndo = useStagedStore((s) => s.pushUndo);

  const groupCount = Object.values(stagedGroups).filter((s) => !s.isDeleted).length;
  const categoryCount = Object.values(stagedCats).filter((s) => !s.isDeleted).length;
  const allGroupIds = Object.keys(stagedGroups);
  const allCollapsed = allGroupIds.length > 0 && allGroupIds.every((id) => collapsedGroups.has(id));

  function handleCollapseAll() {
    setCollapsedGroups(new Set(allGroupIds));
  }

  function handleExpandAll() {
    setCollapsedGroups(new Set());
  }

  // ── Export ────────────────────────────────────────────────────────────────────
  function handleExportCsv() {
    const lines: string[] = ["type,name,group,is_income,hidden"];

    // Emit groups, then their categories, ordered income-first
    const groups = Object.values(stagedGroups)
      .filter((s) => !s.isDeleted)
      .sort((a, b) => Number(b.entity.isIncome) - Number(a.entity.isIncome));

    for (const g of groups) {
      lines.push(
        [
          "group",
          csvField(g.entity.name),
          "",
          String(g.entity.isIncome),
          String(g.entity.hidden),
        ].join(",")
      );

      const cats = Object.values(stagedCats)
        .filter((s) => !s.isDeleted && s.entity.groupId === g.entity.id);

      for (const c of cats) {
        lines.push(
          [
            "category",
            csvField(c.entity.name),
            csvField(g.entity.name),
            String(c.entity.isIncome),
            String(c.entity.hidden),
          ].join(",")
        );
      }
    }

    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "categories.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Import ────────────────────────────────────────────────────────────────────
  function handleImportCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text !== "string") return;

      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
      if (lines.length < 2) { toast.error("CSV has no data rows."); return; }

      const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
      const typeIdx      = headers.indexOf("type");
      const nameIdx      = headers.indexOf("name");
      const groupIdx     = headers.indexOf("group");
      const isIncomeIdx  = headers.indexOf("is_income");
      const hiddenIdx    = headers.indexOf("hidden");

      if (typeIdx === -1 || nameIdx === -1) {
        toast.error('CSV must have "type" and "name" columns.');
        return;
      }

      // Build a name→id map from existing staged groups
      const groupNameToId = new Map<string, string>();
      for (const s of Object.values(stagedGroups)) {
        if (!s.isDeleted) groupNameToId.set(s.entity.name.trim().toLowerCase(), s.entity.id);
      }

      pushUndo();

      let groupsImported = 0;
      let catsImported = 0;
      let skipped = 0;

      // First pass: create groups so categories can reference them
      for (let i = 1; i < lines.length; i++) {
        const fields = parseCsvLine(lines[i]);
        const type = fields[typeIdx]?.trim().toLowerCase() ?? "";
        if (type !== "group") continue;

        const name = fields[nameIdx]?.trim() ?? "";
        if (!name) { skipped++; continue; }

        const key = name.toLowerCase();
        if (groupNameToId.has(key)) {
          // Group already exists — skip creating it but keep the mapping
          skipped++;
          continue;
        }

        const id = crypto.randomUUID();
        const isIncome = isIncomeIdx !== -1 ? parseBoolean(fields[isIncomeIdx] ?? "") : false;
        const hidden   = hiddenIdx   !== -1 ? parseBoolean(fields[hiddenIdx]   ?? "") : false;

        stageNew("categoryGroups", { id, name, isIncome, hidden, categoryIds: [] });
        groupNameToId.set(key, id);
        groupsImported++;
      }

      // Second pass: create categories
      for (let i = 1; i < lines.length; i++) {
        const fields = parseCsvLine(lines[i]);
        const type = fields[typeIdx]?.trim().toLowerCase() ?? "";
        if (type !== "category") continue;

        const name = fields[nameIdx]?.trim() ?? "";
        if (!name) { skipped++; continue; }

        const groupName = groupIdx !== -1 ? fields[groupIdx]?.trim() ?? "" : "";
        const groupId = groupNameToId.get(groupName.toLowerCase());

        if (!groupId) {
          skipped++;
          continue;
        }

        const isIncome = isIncomeIdx !== -1 ? parseBoolean(fields[isIncomeIdx] ?? "") : false;
        const hidden   = hiddenIdx   !== -1 ? parseBoolean(fields[hiddenIdx]   ?? "") : false;

        stageNew("categories", { id: crypto.randomUUID(), name, groupId, isIncome, hidden });
        catsImported++;
      }

      const total = groupsImported + catsImported;
      if (total === 0) {
        toast.warning(skipped > 0 ? `No rows imported — ${skipped} skipped.` : "No valid rows found in CSV.");
      } else {
        const parts: string[] = [];
        if (groupsImported > 0) parts.push(`${groupsImported} group${groupsImported !== 1 ? "s" : ""}`);
        if (catsImported > 0)   parts.push(`${catsImported} categor${catsImported !== 1 ? "ies" : "y"}`);
        const suffix = skipped > 0 ? ` (${skipped} skipped)` : "";
        toast.success(`Imported ${parts.join(" and ")}${suffix}.`);
      }
    };

    reader.readAsText(file, "utf-8");
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading categories…
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm">
        <p className="text-destructive">
          {error instanceof Error ? error.message : "An error occurred"}
        </p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-semibold">Categories</h1>
          <span className="text-xs text-muted-foreground">
            {groupCount} group{groupCount !== 1 ? "s" : ""} · {categoryCount} categories
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost" size="sm"
            className="h-7 text-xs text-muted-foreground"
            onClick={allCollapsed ? handleExpandAll : handleCollapseAll}
            title={allCollapsed ? "Expand all groups" : "Collapse all groups"}
          >
            {allCollapsed
              ? <><ChevronsUpDown className="mr-1 h-3.5 w-3.5" /> Expand All</>
              : <><ChevronsDownUp className="mr-1 h-3.5 w-3.5" /> Collapse All</>}
          </Button>

          <input
            ref={importInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleImportCsv}
          />
          <Button variant="outline" size="sm" onClick={() => importInputRef.current?.click()} title="Import CSV">
            <Upload />
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} title="Export CSV">
            <Download />
            Export
          </Button>
        </div>
      </div>

      {/* Tree grid */}
      <div className="flex-1 overflow-auto">
        <CategoriesTable
          collapsedGroups={collapsedGroups}
          setCollapsedGroups={setCollapsedGroups}
        />
      </div>
    </div>
  );
}
