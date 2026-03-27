import { csvField } from "@/lib/csv";
import type { StagedMap } from "@/types/staged";
import type { CategoryGroup, Category } from "@/types/entities";

/**
 * Serializes staged category groups and categories to a CSV string.
 * Groups are emitted first (income groups before expense), followed by their
 * categories. Deleted entities are excluded.
 */
export function exportCategoriesToCsv(
  stagedGroups: StagedMap<CategoryGroup>,
  stagedCats: StagedMap<Category>
): string {
  const lines = ["type,name,group,is_income,hidden"];

  const groups = Object.values(stagedGroups)
    .filter((s) => !s.isDeleted)
    .sort((a, b) => Number(b.entity.isIncome) - Number(a.entity.isIncome));

  for (const g of groups) {
    lines.push(
      ["group", csvField(g.entity.name), "", String(g.entity.isIncome), String(g.entity.hidden)].join(",")
    );

    const cats = Object.values(stagedCats).filter(
      (s) => !s.isDeleted && s.entity.groupId === g.entity.id
    );
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

  return lines.join("\n");
}
