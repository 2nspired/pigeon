import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { db } from "@/server/db";

export const scratchRouter = createTRPCRouter({
	list: publicProcedure
		.input(z.object({ boardId: z.string().uuid() }))
		.query(async ({ input }) => {
			const now = new Date();
			const entries = await db.agentScratch.findMany({
				where: {
					boardId: input.boardId,
					OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
				},
				orderBy: [{ agentName: "asc" }, { updatedAt: "desc" }],
			});
			return entries;
		}),
});
