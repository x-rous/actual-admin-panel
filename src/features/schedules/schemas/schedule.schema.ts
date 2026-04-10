import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const recurConfigSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  interval: z.number().int().min(1).optional(),
  patterns: z
    .array(z.object({ value: z.number(), type: z.string() }))
    .optional(),
  skipWeekend: z.boolean().optional(),
  start: z.string().regex(ISO_DATE, "Must be YYYY-MM-DD"),
  endMode: z.enum(["never", "after_n_occurrences", "on_date"]),
  endOccurrences: z.number().int().min(1).optional(),
  endDate: z.string().regex(ISO_DATE, "Must be YYYY-MM-DD").optional(),
  weekendSolveMode: z.enum(["before", "after"]).optional(),
});

export const scheduleFormSchema = z
  .object({
    name: z.string().optional(),
    payeeId: z.string().optional(),
    accountId: z.string().optional(),
    postsTransaction: z.boolean(),

    // ── Date ──────────────────────────────────────────────────────────────────
    dateMode: z.enum(["once", "recurring"]),
    onceDate: z.string().optional(),
    frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
    interval: z.number().int().min(1),
    start: z.string(),
    endMode: z.enum(["never", "after_n_occurrences", "on_date"]),
    endOccurrences: z.number().int().min(1),
    endDate: z.string().optional(),
    skipWeekend: z.boolean(),
    weekendSolveMode: z.enum(["before", "after"]),
    // Monthly pattern
    patternMode: z.enum(["none", "specific_day", "day_of_week"]),
    patternDay: z.number().int(),
    patternWeekNum: z.number().int(),
    patternWeekDay: z.string(),

    // ── Amount ────────────────────────────────────────────────────────────────
    amountOp: z.enum(["", "is", "isapprox", "isbetween"]),
    amount: z.string(),
    amountNum1: z.string(),
    amountNum2: z.string(),
  })
  .superRefine((data, ctx) => {
    if (data.dateMode === "once") {
      if (!data.onceDate || !ISO_DATE.test(data.onceDate)) {
        ctx.addIssue({
          code: "custom",
          path: ["onceDate"],
          message: "A valid date is required",
        });
      }
    } else {
      if (!data.start || !ISO_DATE.test(data.start)) {
        ctx.addIssue({
          code: "custom",
          path: ["start"],
          message: "A valid start date is required",
        });
      }
      if (data.endMode === "after_n_occurrences" && !(data.endOccurrences >= 1)) {
        ctx.addIssue({
          code: "custom",
          path: ["endOccurrences"],
          message: "Must be at least 1",
        });
      }
      if (data.endMode === "on_date" && (!data.endDate || !ISO_DATE.test(data.endDate))) {
        ctx.addIssue({
          code: "custom",
          path: ["endDate"],
          message: "A valid end date is required",
        });
      }
    }
    if (data.amountOp === "isbetween") {
      if (!data.amountNum1 || isNaN(parseFloat(data.amountNum1))) {
        ctx.addIssue({ code: "custom", path: ["amountNum1"], message: "Required" });
      }
      if (!data.amountNum2 || isNaN(parseFloat(data.amountNum2))) {
        ctx.addIssue({ code: "custom", path: ["amountNum2"], message: "Required" });
      }
    }
    if ((data.amountOp === "is" || data.amountOp === "isapprox") && data.amount) {
      if (isNaN(parseFloat(data.amount))) {
        ctx.addIssue({ code: "custom", path: ["amount"], message: "Must be a number" });
      }
    }
  });

export type ScheduleFormValues = z.infer<typeof scheduleFormSchema>;

export function defaultFormValues(): ScheduleFormValues {
  const today = new Date().toISOString().slice(0, 10);
  return {
    name: "",
    payeeId: "",
    accountId: "",
    postsTransaction: false,
    dateMode: "once",
    onceDate: today,
    frequency: "monthly",
    interval: 1,
    start: today,
    endMode: "never",
    endOccurrences: 12,
    endDate: "",
    skipWeekend: false,
    weekendSolveMode: "before",
    patternMode: "none",
    patternDay: 1,
    patternWeekNum: 1,
    patternWeekDay: "MO",
    amountOp: "",
    amount: "",
    amountNum1: "",
    amountNum2: "",
  };
}
