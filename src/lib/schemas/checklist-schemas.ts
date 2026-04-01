import { z } from "zod";

export const createChecklistItemSchema = z.object({
	cardId: z.string().uuid(),
	text: z.string().min(1, "Text is required.").max(500),
});

export const updateChecklistItemSchema = z.object({
	text: z.string().min(1).max(500).optional(),
	completed: z.boolean().optional(),
});

export type CreateChecklistItemInput = z.infer<typeof createChecklistItemSchema>;
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;
