import { z } from "zod";

export const categoryGroupSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name is required").max(100, "Name cannot exceed 100 characters"),
  isIncome: z.boolean(),
  hidden: z.boolean(),
});

export const categorySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, "Name is required").max(100, "Name cannot exceed 100 characters"),
  groupId: z.string().min(1, "Group is required"),
  isIncome: z.boolean(),
  hidden: z.boolean(),
});

export type CategoryGroupFormValues = z.infer<typeof categoryGroupSchema>;
export type CategoryFormValues = z.infer<typeof categorySchema>;
