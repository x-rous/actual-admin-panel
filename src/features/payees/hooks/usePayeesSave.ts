"use client";

import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStagedStore } from "@/store/staged";
import { useConnectionStore, selectActiveInstance } from "@/store/connection";
import { createPayee, updatePayee, deletePayee } from "@/lib/api/payees";
import type { SaveResult, SaveSummary } from "@/types/diff";
import type { StagedEntity } from "@/types/staged";
import type { Payee } from "@/types/entities";

function extractMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err)
    return String((err as { message: unknown }).message);
  return fallback;
}

function computeSaveOperations(staged: Record<string, StagedEntity<Payee>>) {
  const toCreate: Payee[] = [];
  const toUpdate: Payee[] = [];
  const toDelete: string[] = [];

  for (const s of Object.values(staged)) {
    if (s.isNew && !s.isDeleted) toCreate.push(s.entity);
    else if (s.isDeleted && !s.isNew) toDelete.push(s.entity.id);
    else if (s.isUpdated && !s.isDeleted) toUpdate.push(s.entity);
  }

  return { toCreate, toUpdate, toDelete };
}

export function usePayeesSave() {
  const [isSaving, setIsSaving] = useState(false);

  const connection = useConnectionStore(selectActiveInstance);
  const staged = useStagedStore((s) => s.payees);
  const queryClient = useQueryClient();

  const hasPendingChanges = useMemo(
    () => Object.values(staged).some((s) => s.isNew || s.isUpdated || s.isDeleted),
    [staged]
  );

  async function save(): Promise<SaveSummary> {
    if (!connection) throw new Error("No active connection");

    setIsSaving(true);

    const { toCreate, toUpdate, toDelete } = computeSaveOperations(staged);
    const succeeded: SaveResult[] = [];
    const failed: SaveResult[] = [];

    for (const payee of toCreate) {
      try {
        await createPayee(connection, { name: payee.name });
        succeeded.push({ status: "success", id: payee.id });
      } catch (err) {
        failed.push({
          status: "error",
          id: payee.id,
          message: extractMessage(err, "Create failed"),
        });
      }
    }

    for (const payee of toUpdate) {
      try {
        await updatePayee(connection, payee.id, { name: payee.name });
        succeeded.push({ status: "success", id: payee.id });
      } catch (err) {
        failed.push({
          status: "error",
          id: payee.id,
          message: extractMessage(err, "Update failed"),
        });
      }
    }

    for (const id of toDelete) {
      try {
        await deletePayee(connection, id);
        succeeded.push({ status: "success", id });
      } catch (err) {
        failed.push({
          status: "error",
          id,
          message: extractMessage(err, "Delete failed"),
        });
      }
    }

    setIsSaving(false);

    if (failed.length > 0) {
      const errors: Record<string, string> = {};
      for (const f of failed) {
        if (f.status === "error") errors[f.id] = f.message;
      }
      useStagedStore.getState().setSaveErrors("payees", errors);
    }

    await queryClient.invalidateQueries({ queryKey: ["payees", connection.id] });

    return { succeeded, failed };
  }

  return { save, isSaving, hasPendingChanges };
}
