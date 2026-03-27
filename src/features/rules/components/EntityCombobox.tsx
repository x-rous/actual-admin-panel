"use client";

import { SearchableCombobox, MultiSearchableCombobox } from "@/components/ui/combobox";
import { useEntityOptions } from "../hooks/useEntityOptions";

export function EntityCombobox({
  entity,
  value,
  onChange,
}: {
  entity: "payee" | "category" | "account";
  value: string;
  onChange: (v: string) => void;
}) {
  const options = useEntityOptions(entity);
  const placeholder =
    entity === "payee"
      ? "Select payee…"
      : entity === "category"
      ? "Select category…"
      : "Select account…";
  return (
    <SearchableCombobox options={options} value={value} onChange={onChange} placeholder={placeholder} />
  );
}

export function MultiEntityCombobox({
  entity,
  values,
  onChange,
}: {
  entity: "payee" | "category" | "account";
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const options = useEntityOptions(entity);
  const placeholder =
    entity === "payee"
      ? "Select payees…"
      : entity === "category"
      ? "Select categories…"
      : "Select accounts…";
  return (
    <MultiSearchableCombobox
      options={options}
      values={values}
      onChange={onChange}
      placeholder={placeholder}
    />
  );
}
