import { z } from "zod";

export const createNoteSchema = z.object({
	title: z.string().min(1, "Title is required.").max(200),
	content: z.string().max(10000).default(""),
});

export const updateNoteSchema = z.object({
	title: z.string().min(1).max(200).optional(),
	content: z.string().max(10000).optional(),
});

export type CreateNoteInput = z.infer<typeof createNoteSchema>;
export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
