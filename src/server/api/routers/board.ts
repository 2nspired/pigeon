import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createBoardSchema, updateBoardSchema } from "@/lib/schemas/board-schemas";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { boardService } from "@/server/services/board-service";

export const boardRouter = createTRPCRouter({
	list: publicProcedure
		.input(z.object({ projectId: z.string().uuid() }))
		.query(async ({ input }) => {
			const result = await boardService.list(input.projectId);
			if (!result.success) {
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
			}
			return result.data;
		}),

	getFull: publicProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ input }) => {
			const result = await boardService.getFull(input.id);
			if (!result.success) {
				throw new TRPCError({ code: "NOT_FOUND", message: result.error.message });
			}
			return result.data;
		}),

	create: publicProcedure.input(createBoardSchema).mutation(async ({ input }) => {
		const result = await boardService.create(input);
		if (!result.success) {
			throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
		}
		return result.data;
	}),

	update: publicProcedure
		.input(z.object({ id: z.string().uuid(), data: updateBoardSchema }))
		.mutation(async ({ input }) => {
			const result = await boardService.update(input.id, input.data);
			if (!result.success) {
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
			}
			return result.data;
		}),

	delete: publicProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ input }) => {
			const result = await boardService.delete(input.id);
			if (!result.success) {
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
			}
			return result.data;
		}),
});
