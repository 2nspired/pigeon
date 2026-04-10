import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { emitCardChanged } from "@/lib/events";
import {
	createChecklistItemSchema,
	updateChecklistItemSchema,
} from "@/lib/schemas/checklist-schemas";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { checklistService } from "@/server/services/checklist-service";

export const checklistRouter = createTRPCRouter({
	create: publicProcedure.input(createChecklistItemSchema).mutation(async ({ input }) => {
		const result = await checklistService.create(input);
		if (!result.success) {
			throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
		}
		emitCardChanged(input.cardId);
		return result.data;
	}),

	update: publicProcedure
		.input(z.object({ id: z.string().uuid(), data: updateChecklistItemSchema }))
		.mutation(async ({ input }) => {
			const result = await checklistService.update(input.id, input.data);
			if (!result.success) {
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
			}
			emitCardChanged(result.data.cardId);
			return result.data;
		}),

	delete: publicProcedure.input(z.object({ id: z.string().uuid() })).mutation(async ({ input }) => {
		const result = await checklistService.delete(input.id);
		if (!result.success) {
			throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
		}
		emitCardChanged(result.data.cardId);
		return result.data;
	}),
});
