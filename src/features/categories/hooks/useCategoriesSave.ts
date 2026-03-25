"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useStagedStore } from "@/store/staged";
import { useConnectionStore, selectActiveInstance } from "@/store/connection";
import { createCategory, updateCategory, deleteCategory } from "@/lib/api/categories";
import type { SaveResult, SaveSummary } from "@/types/diff";
import type { StagedEntity } from "@/types/staged";
import type { Category } from "@/types/entities";

function extractMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err !== null && "message" in err)
    return String((err as { message: unknown }).message);
  return fallback;
}

export function useCategoriesSave() {
  const [isSaving, setIsSaving] = useState(false);

  const connection = useConnectionStore(selectActiveInstance);
  const staged = useStagedStore((s) => s.categories);
  const queryClient = useQueryClient();

  async function save(): Promise<SaveSummary> {
    if (!connection) throw new Error("No active connection");

    setIsSaving(true);

    const entries = Object.values(staged) as StagedEntity<Category>[];
    const toCreate = entries.filter((s) => s.isNew && !s.isDeleted).map((s) => s.entity);
    const toUpdate = entries.filter((s) => s.isUpdated && !s.isNew && !s.isDeleted).map((s) => s.entity);
    const toDelete = entries.filter((s) => s.isDeleted && !s.isNew).map((s) => s.entity.id);

    const succeeded: SaveResult[] = [];
    const failed: SaveResult[] = [];

    for (const cat of toCreate) {
      try {
        await createCategory(connection, {
          name: cat.name,
          groupId: cat.groupId,
          hidden: cat.hidden,
        });
        succeeded.push({ status: "success", id: cat.id });
      } catch (err) {
        failed.push({ status: "error", id: cat.id, message: extractMessage(err, "Create failed") });
      }
    }

    for (const cat of toUpdate) {
      try {
        await updateCategory(connection, cat.id, {
          name: cat.name,
          hidden: cat.hidden,
        });
        succeeded.push({ status: "success", id: cat.id });
      } catch (err) {
        failed.push({ status: "error", id: cat.id, message: extractMessage(err, "Update failed") });
      }
    }

    for (const id of toDelete) {
      try {
        await deleteCategory(connection, id);
        succeeded.push({ status: "success", id });
      } catch (err) {
        failed.push({ status: "error", id, message: extractMessage(err, "Delete failed") });
      }
    }

    setIsSaving(false);

    if (failed.length > 0) {
      const errors: Record<string, string> = {};
      for (const f of failed) {
        if (f.status === "error") errors[f.id] = f.message;
      }
      useStagedStore.getState().setSaveErrors("categories", errors);
    }

    // Both entity types share one query key since they're loaded together
    await queryClient.invalidateQueries({ queryKey: ["categoryGroups", connection.id] });

    return { succeeded, failed };
  }

  return { save, isSaving };
}
