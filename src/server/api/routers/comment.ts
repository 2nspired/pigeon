import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createCommentSchema } from "@/lib/schemas/comment-schemas";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { commentService } from "@/server/services/comment-service";

export const commentRouter = createTRPCRouter({
	list: publicProcedure
		.input(z.object({ cardId: z.string().uuid() }))
		.query(async ({ input }) => {
			const result = await commentService.list(input.cardId);
			if (!result.success) {
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
			}
			return result.data;
		}),

	create: publicProcedure.input(createCommentSchema).mutation(async ({ input }) => {
		const result = await commentService.create(input);
		if (!result.success) {
			throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
		}
		return result.data;
	}),
});
