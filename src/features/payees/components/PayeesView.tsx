"use client";

import { useRef } from "react";
import { Plus, Download, Upload, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useStagedStore } from "@/store/staged";
import { usePayees } from "../hooks/usePayees";
import { PayeesTable } from "./PayeesTable";

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

export function PayeesView() {
  const importInputRef = useRef<HTMLInputElement>(null);

  const { isLoading, isError, error, refetch } = usePayees();

  const staged = useStagedStore((s) => s.payees);
  const stageNew = useStagedStore((s) => s.stageNew);
  const pushUndo = useStagedStore((s) => s.pushUndo);

  function handleAddPayee() {
    pushUndo();
    stageNew("payees", {
      id: crypto.randomUUID(),
      name: "",
    });
  }

  function handleExportCsv() {
    const rows = Object.values(staged).filter((s) => !s.isDeleted);
    const header = "id,name,type";
    const body = rows
      .map(({ entity: { id, name, transferAccountId } }) =>
        `${id},"${name.replace(/"/g, '""')}",${transferAccountId ? "transfer" : "regular"}`
      )
      .join("\n");
    const blob = new Blob(["\uFEFF" + `${header}\n${body}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payees.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text !== "string") return;

      const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
      if (lines.length < 2) {
        toast.error("CSV has no data rows.");
        return;
      }

      const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
      const nameIdx = headers.indexOf("name");

      if (nameIdx === -1) {
        toast.error("CSV must have a \"name\" column.");
        return;
      }

      let imported = 0;
      let skipped = 0;
      pushUndo();

      for (let i = 1; i < lines.length; i++) {
        const fields = parseCsvLine(lines[i]);
        const name = fields[nameIdx]?.trim() ?? "";
        if (!name) { skipped++; continue; }

        stageNew("payees", { id: crypto.randomUUID(), name });
        imported++;
      }

      if (imported === 0) {
        toast.warning("No valid rows found in CSV.");
      } else if (skipped > 0) {
        toast.success(`Imported ${imported} payee${imported !== 1 ? "s" : ""} (${skipped} skipped — empty name).`);
      } else {
        toast.success(`Imported ${imported} payee${imported !== 1 ? "s" : ""}.`);
      }
    };

    reader.readAsText(file, "utf-8");
  }

  const totalCount = Object.keys(staged).length;
  const regularCount = Object.values(staged).filter((s) => !s.entity.transferAccountId && !s.isDeleted).length;

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading payees…
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
          <h1 className="text-sm font-semibold">Payees</h1>
          <span className="text-xs text-muted-foreground">
            {regularCount} regular · {totalCount} total
          </span>
        </div>

        <div className="flex items-center gap-2">
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
          <Button size="sm" onClick={handleAddPayee}>
            <Plus />
            Add Payee
          </Button>
        </div>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto">
        <PayeesTable />
      </div>
    </div>
  );
}
