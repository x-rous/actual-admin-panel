/**
 * Structured error types used throughout the application.
 * Use discriminated unions so callers can narrow precisely.
 */

export type ValidationError = {
  kind: "validation";
  field: string;
  message: string;
};

export type DependencyError = {
  kind: "dependency";
  entityId: string;
  entityType: string;
  message: string;
};

export type ApiError = {
  kind: "api";
  status: number;
  message: string;
  raw?: unknown;
};

export type UnknownError = {
  kind: "unknown";
  message: string;
  raw?: unknown;
};

export type AppError = ValidationError | DependencyError | ApiError | UnknownError;

export function isApiError(e: AppError): e is ApiError {
  return e.kind === "api";
}

export function isValidationError(e: AppError): e is ValidationError {
  return e.kind === "validation";
}

export function isDependencyError(e: AppError): e is DependencyError {
  return e.kind === "dependency";
}

export function toUnknownError(raw: unknown): UnknownError {
  const message =
    raw instanceof Error ? raw.message : "An unexpected error occurred";
  return { kind: "unknown", message, raw };
}
