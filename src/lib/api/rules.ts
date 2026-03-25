/**
 * Typed API functions for the Rules entity.
 * Rule fields are already camelCase in the API — no snake_case conversion needed.
 */

import { apiRequest } from "./client";
import type { ConnectionInstance } from "@/store/connection";
import type { ApiRule, ApiListResponse, ApiSingleResponse } from "@/types/api";
import type { Rule } from "@/types/entities";

// ─── Normalization ────────────────────────────────────────────────────────────

function normalizeRule(raw: ApiRule): Rule {
  return {
    id: raw.id!,
    stage: raw.stage,
    conditionsOp: raw.conditionsOp ?? "and",
    conditions: raw.conditions ?? [],
    actions: raw.actions ?? [],
  };
}

// ─── API functions ────────────────────────────────────────────────────────────

export async function getRules(connection: ConnectionInstance): Promise<Rule[]> {
  const response = await apiRequest<ApiListResponse<ApiRule>>(connection, "/rules");
  return response.data.map(normalizeRule);
}

export async function createRule(
  connection: ConnectionInstance,
  input: Omit<Rule, "id">
): Promise<Rule> {
  const response = await apiRequest<ApiSingleResponse<ApiRule>>(connection, "/rules", {
    method: "POST",
    body: {
      rule: {
        stage: input.stage,
        conditionsOp: input.conditionsOp,
        conditions: input.conditions,
        actions: input.actions,
      },
    },
  });
  return normalizeRule(response.data);
}

export async function updateRule(
  connection: ConnectionInstance,
  id: string,
  patch: Partial<Omit<Rule, "id">>
): Promise<void> {
  await apiRequest<void>(connection, `/rules/${id}`, {
    method: "PATCH",
    body: { rule: { id, ...patch } },
  });
}

export async function deleteRule(
  connection: ConnectionInstance,
  id: string
): Promise<void> {
  await apiRequest<void>(connection, `/rules/${id}`, { method: "DELETE" });
}
