import { parseCsvLine, parseBoolean } from "@/lib/csv";
import type { CategoryGroup, Category } from "@/types/entities";

export type CategoriesImportResult = {
  groups: Omit<CategoryGroup, "categoryIds">[];
  categories: Omit<Category, "id">[];
  /** IDs of groups that were skipped because they already exist (by name). */
  existingGroupNames: string[];
  skipped: number;
};

export type CategoriesImportError = { error: string };

/**
 * Parses a CSV string into groups and categories to create.
 * Pure function — does not touch the store. Caller is responsible for staging
 * and for providing existing group names to avoid duplicates.
 *
 * Required columns: type, name
 * Optional columns: group, is_income, hidden
 */
export function importCategoriesFromCsv(
  text: string,
  existingGroups: { name: string; id: string }[]
): CategoriesImportResult | CategoriesImportError {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (lines.length < 2) return { error: "CSV has no data rows." };

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const typeIdx = headers.indexOf("type");
  const nameIdx = headers.indexOf("name");
  if (typeIdx === -1 || nameIdx === -1)
    return { error: 'CSV must have "type" and "name" columns.' };

  const groupIdx = headers.indexOf("group");
  const isIncomeIdx = headers.indexOf("is_income");
  const hiddenIdx = headers.indexOf("hidden");

  // Build name→id map from existing groups (lowercase keys for case-insensitive match)
  const groupNameToId = new Map<string, string>(
    existingGroups.map(({ name, id }) => [name.trim().toLowerCase(), id])
  );

  const groups: Omit<CategoryGroup, "categoryIds">[] = [];
  const categories: Omit<Category, "id">[] = [];
  const existingGroupNames: string[] = [];
  let skipped = 0;

  // First pass: collect new groups
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const type = fields[typeIdx]?.trim().toLowerCase() ?? "";
    if (type !== "group") continue;

    const name = fields[nameIdx]?.trim() ?? "";
    if (!name) { skipped++; continue; }

    const key = name.toLowerCase();
    if (groupNameToId.has(key)) {
      existingGroupNames.push(name);
      skipped++;
      continue;
    }

    const id = crypto.randomUUID();
    const isIncome = isIncomeIdx !== -1 ? parseBoolean(fields[isIncomeIdx] ?? "") : false;
    const hidden = hiddenIdx !== -1 ? parseBoolean(fields[hiddenIdx] ?? "") : false;

    groups.push({ id, name, isIncome, hidden });
    groupNameToId.set(key, id);
  }

  // Second pass: collect categories (references groups by name)
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const type = fields[typeIdx]?.trim().toLowerCase() ?? "";
    if (type !== "category") continue;

    const name = fields[nameIdx]?.trim() ?? "";
    if (!name) { skipped++; continue; }

    const groupName = groupIdx !== -1 ? (fields[groupIdx]?.trim() ?? "") : "";
    const groupId = groupNameToId.get(groupName.toLowerCase());
    if (!groupId) { skipped++; continue; }

    const isIncome = isIncomeIdx !== -1 ? parseBoolean(fields[isIncomeIdx] ?? "") : false;
    const hidden = hiddenIdx !== -1 ? parseBoolean(fields[hiddenIdx] ?? "") : false;

    categories.push({ name, groupId, isIncome, hidden });
  }

  return { groups, categories, existingGroupNames, skipped };
}
