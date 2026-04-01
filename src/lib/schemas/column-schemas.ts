import { z } from "zod";

export const createColumnSchema = z.object({
	boardId: z.string().uuid(),
	name: z.string().min(1, "Name is required.").max(50),
	description: z.string().max(200).optional(),
	color: z.string().max(20).optional(),
});

export const updateColumnSchema = z.object({
	name: z.string().min(1).max(50).optional(),
	description: z.string().max(200).nullable().optional(),
	color: z.string().max(20).nullable().optional(),
});

export const reorderColumnsSchema = z.object({
	boardId: z.string().uuid(),
	columnIds: z.array(z.string().uuid()),
});

export type CreateColumnInput = z.infer<typeof createColumnSchema>;
export type UpdateColumnInput = z.infer<typeof updateColumnSchema>;
