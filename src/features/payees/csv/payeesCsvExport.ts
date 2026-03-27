import { csvField } from "@/lib/csv";
import type { StagedMap } from "@/types/staged";
import type { Payee } from "@/types/entities";

/**
 * Serializes staged payees to a CSV string (no BOM, no blob — caller handles download).
 * Transfer payees are included; deleted entities are excluded.
 */
export function exportPayeesToCsv(staged: StagedMap<Payee>): string {
  const rows = Object.values(staged).filter((s) => !s.isDeleted);
  const lines = [
    "id,name,type",
    ...rows.map(({ entity: { id, name, transferAccountId } }) =>
      `${id},${csvField(name)},${transferAccountId ? "transfer" : "regular"}`
    ),
  ];
  return lines.join("\n");
}
