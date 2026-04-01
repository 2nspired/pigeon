import { z } from "zod";
import { actorValues } from "./card-schemas";

export const createCommentSchema = z.object({
	cardId: z.string().uuid(),
	content: z.string().min(1, "Content is required.").max(5000),
	authorType: z.enum(actorValues).default("HUMAN"),
	authorName: z.string().max(100).optional(),
});

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
