import { TRPCError } from "@trpc/server";
import { createColumnSchema, reorderColumnsSchema, updateColumnSchema } from "@/lib/schemas/column-schemas";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { columnService } from "@/server/services/column-service";

export const columnRouter = createTRPCRouter({
	create: publicProcedure.input(createColumnSchema).mutation(async ({ input }) => {
		const result = await columnService.create(input);
		if (!result.success) {
			throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
		}
		return result.data;
	}),

	update: publicProcedure
		.input(z.object({ id: z.string().uuid(), data: updateColumnSchema }))
		.mutation(async ({ input }) => {
			const result = await columnService.update(input.id, input.data);
			if (!result.success) {
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
			}
			return result.data;
		}),

	reorder: publicProcedure.input(reorderColumnsSchema).mutation(async ({ input }) => {
		const result = await columnService.reorder(input.boardId, input.columnIds);
		if (!result.success) {
			throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
		}
		return result.data;
	}),

	delete: publicProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ input }) => {
			const result = await columnService.delete(input.id);
			if (!result.success) {
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
			}
			return result.data;
		}),
});
