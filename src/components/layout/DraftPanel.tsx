"use client";

import { useStagedStore, selectHasChanges } from "@/store/staged";
import type { BaseEntity } from "@/types/entities";
import type { StagedEntity } from "@/types/staged";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

type EntityKey =
  | "accounts"
  | "payees"
  | "categoryGroups"
  | "categories"
  | "rules"
  | "schedules";

const ENTITY_LABELS: Record<EntityKey, string> = {
  accounts: "Accounts",
  payees: "Payees",
  categoryGroups: "Category Groups",
  categories: "Categories",
  rules: "Rules",
  schedules: "Schedules",
};

function getLabel(entity: BaseEntity): string {
  return (entity as { name?: string }).name?.trim() || entity.id.slice(0, 8);
}

function EntitySection({ label, entries }: { label: string; entries: StagedEntity<BaseEntity>[] }) {
  const created = entries.filter((s) => s.isNew && !s.isDeleted);
  const updated = entries.filter((s) => s.isUpdated && !s.isNew && !s.isDeleted);
  const deleted = entries.filter((s) => s.isDeleted && !s.isNew);
  const errored = entries.filter((s) => s.saveError);
  const total = created.length + updated.length + deleted.length;

  if (total === 0 && errored.length === 0) return null;

  return (
    <div className="px-3 py-2">
      <p className="mb-1.5 text-xs font-semibold">{label}</p>
      <div className="flex flex-col gap-1">
        {created.length > 0 && (
          <ItemGroup variant="created" items={created} />
        )}
        {updated.length > 0 && (
          <ItemGroup variant="updated" items={updated} />
        )}
        {deleted.length > 0 && (
          <ItemGroup variant="deleted" items={deleted} />
        )}
        {errored.length > 0 && (
          <ItemGroup variant="error" items={errored} />
        )}
      </div>
    </div>
  );
}

function ItemGroup({
  variant,
  items,
}: {
  variant: "created" | "updated" | "deleted" | "error";
  items: StagedEntity<BaseEntity>[];
}) {
  const label =
    variant === "created" ? "Created" :
    variant === "updated" ? "Updated" :
    variant === "deleted" ? "Deleted" : "Errors";

  const dot =
    variant === "created" ? "bg-green-500" :
    variant === "updated" ? "bg-amber-400" :
    variant === "deleted" ? "bg-muted-foreground/50" : "bg-destructive";

  return (
    <div>
      <p className={cn(
        "mb-0.5 text-[10px] font-medium uppercase tracking-wide",
        variant === "error" ? "text-destructive" : "text-muted-foreground"
      )}>
        {label} ({items.length})
      </p>
      <ul className="space-y-0.5">
        {items.slice(0, 8).map((s) => (
          <li key={s.entity.id} className="flex items-start gap-1.5">
            <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", dot)} />
            <span className="min-w-0 text-xs text-foreground/80 break-words leading-tight">
              {getLabel(s.entity)}
              {s.saveError && (
                <span className="block text-[10px] text-destructive leading-tight">
                  {s.saveError}
                </span>
              )}
            </span>
          </li>
        ))}
        {items.length > 8 && (
          <li className="text-xs text-muted-foreground pl-3">
            +{items.length - 8} more
          </li>
        )}
      </ul>
    </div>
  );
}

export function DraftPanel() {
  const state = useStagedStore((s) => s);
  const hasChanges = useStagedStore(selectHasChanges);
  const entityKeys = Object.keys(ENTITY_LABELS) as EntityKey[];

  const errorCount = entityKeys.reduce((acc, key) => {
    return acc + Object.values(state[key] as Record<string, StagedEntity<BaseEntity>>)
      .filter((s) => s.saveError).length;
  }, 0);

  return (
    <aside className="flex w-56 shrink-0 flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Draft Changes
        </span>
        <div className="flex gap-1">
          {errorCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {errorCount} error{errorCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {hasChanges && errorCount === 0 && (
            <Badge variant="secondary" className="text-xs">
              pending
            </Badge>
          )}
        </div>
      </div>
      <Separator />

      {!hasChanges ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">
          No pending changes.
        </p>
      ) : (
        <div className="flex flex-col gap-0 overflow-y-auto">
          {entityKeys.map((key) => (
            <EntitySection
              key={key}
              label={ENTITY_LABELS[key]}
              entries={Object.values(state[key] as Record<string, StagedEntity<BaseEntity>>)}
            />
          ))}
        </div>
      )}
    </aside>
  );
}
