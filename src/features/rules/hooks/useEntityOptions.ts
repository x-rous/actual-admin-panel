"use client";

import { useStagedStore } from "@/store/staged";
import type { ComboboxOption } from "@/components/ui/combobox";

/**
 * Returns a sorted list of { id, name } options for the given entity type,
 * sourced from the staged store. Deleted entities are excluded.
 */
export function useEntityOptions(entity: "payee" | "category" | "account"): ComboboxOption[] {
  const payees = useStagedStore((s) => s.payees);
  const categories = useStagedStore((s) => s.categories);
  const accounts = useStagedStore((s) => s.accounts);

  const map = entity === "payee" ? payees : entity === "category" ? categories : accounts;
  return Object.values(map)
    .filter((s) => !s.isDeleted)
    .map((s) => ({ id: s.entity.id, name: s.entity.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
