import { csvField } from "@/lib/csv";
import type { StagedMap } from "@/types/staged";
import type { Account } from "@/types/entities";

/**
 * Serializes staged accounts to a CSV string (no BOM, no blob — caller handles download).
 * Deleted entities are excluded.
 */
export function exportAccountsToCsv(staged: StagedMap<Account>): string {
  const rows = Object.values(staged).filter((s) => !s.isDeleted);
  const lines = [
    "id,name,offBudget,closed",
    ...rows.map(({ entity: { id, name, offBudget, closed } }) =>
      `${id},${csvField(name)},${offBudget},${closed}`
    ),
  ];
  return lines.join("\n");
}
