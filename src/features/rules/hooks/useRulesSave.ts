"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStagedStore } from "@/store/staged";
import { useConnectionStore, selectActiveInstance } from "@/store/connection";
import { createRule, updateRule, deleteRule } from "@/lib/api/rules";
import type { SaveResult, SaveSummary } from "@/types/diff";
import type { StagedEntity } from "@/types/staged";
import type { Rule } from "@/types/entities";

function extractMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err)
    return String((err as { message: unknown }).message);
  return fallback;
}

function computeSaveOperations(staged: Record<string, StagedEntity<Rule>>) {
  const toCreate: Rule[] = [];
  const toUpdate: Rule[] = [];
  const toDelete: string[] = [];

  for (const s of Object.values(staged)) {
    if (s.isNew && !s.isDeleted) toCreate.push(s.entity);
    else if (s.isDeleted && !s.isNew) toDelete.push(s.entity.id);
    else if (s.isUpdated && !s.isDeleted) toUpdate.push(s.entity);
  }

  return { toCreate, toUpdate, toDelete };
}

export function useRulesSave() {
  const [isSaving, setIsSaving] = useState(false);

  const connection = useConnectionStore(selectActiveInstance);
  const staged = useStagedStore((s) => s.rules);
  const queryClient = useQueryClient();

  async function save(): Promise<SaveSummary> {
    if (!connection) throw new Error("No active connection");

    setIsSaving(true);

    const { toCreate, toUpdate, toDelete } = computeSaveOperations(staged);
    const succeeded: SaveResult[] = [];
    const failed: SaveResult[] = [];

    for (const rule of toCreate) {
      try {
        await createRule(connection, {
          stage: rule.stage,
          conditionsOp: rule.conditionsOp,
          conditions: rule.conditions,
          actions: rule.actions,
        });
        succeeded.push({ status: "success", id: rule.id });
      } catch (err) {
        failed.push({
          status: "error",
          id: rule.id,
          message: extractMessage(err, "Create failed"),
        });
      }
    }

    for (const rule of toUpdate) {
      try {
        await updateRule(connection, rule.id, {
          stage: rule.stage,
          conditionsOp: rule.conditionsOp,
          conditions: rule.conditions,
          actions: rule.actions,
        });
        succeeded.push({ status: "success", id: rule.id });
      } catch (err) {
        failed.push({
          status: "error",
          id: rule.id,
          message: extractMessage(err, "Update failed"),
        });
      }
    }

    for (const id of toDelete) {
      try {
        await deleteRule(connection, id);
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
      useStagedStore.getState().setSaveErrors("rules", errors);
    }

    await queryClient.invalidateQueries({ queryKey: ["rules", connection.id] });

    return { succeeded, failed };
  }

  return { save, isSaving };
}
