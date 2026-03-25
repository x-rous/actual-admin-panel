import { z } from "zod";

export const payeeFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name cannot exceed 100 characters"),
});

export type PayeeFormValues = z.infer<typeof payeeFormSchema>;
