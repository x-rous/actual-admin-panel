"use client";

import { useRef } from "react";
import { Plus, Download, Upload, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CSV_MAX_BYTES } from "@/lib/csv";
import { useStagedStore } from "@/store/staged";
import { usePayees } from "../hooks/usePayees";
import { PayeesTable } from "./PayeesTable";
import { exportPayeesToCsv } from "../csv/payeesCsvExport";
import { importPayeesFromCsv } from "../csv/payeesCsvImport";

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
    const csv = exportPayeesToCsv(staged);
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
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

    if (file.size > CSV_MAX_BYTES) {
      toast.error("File is too large (max 5 MB).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text !== "string") return;

      const result = importPayeesFromCsv(text);
      if ("error" in result) { toast.error(result.error); return; }

      pushUndo();
      for (const payee of result.payees) {
        stageNew("payees", { id: crypto.randomUUID(), ...payee });
      }

      const imported = result.payees.length;
      if (imported === 0) {
        toast.warning("No valid rows found in CSV.");
      } else if (result.skipped > 0) {
        toast.success(`Imported ${imported} payee${imported !== 1 ? "s" : ""} (${result.skipped} skipped — empty name).`);
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
