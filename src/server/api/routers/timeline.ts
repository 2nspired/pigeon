import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { timelineService } from "@/server/services/timeline-service";

export const timelineRouter = createTRPCRouter({
	listByBoard: publicProcedure
		.input(z.object({
			boardId: z.string().uuid(),
			projectId: z.string().uuid(),
			limit: z.number().int().min(1).max(100).default(50),
		}))
		.query(async ({ input }) => {
			const result = await timelineService.listByBoard(input.boardId, input.projectId, input.limit);
			if (!result.success) {
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
			}
			return result.data;
		}),
});
