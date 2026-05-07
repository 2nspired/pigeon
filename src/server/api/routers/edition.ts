/**
 * The Daily Squawk — tRPC adapter (#298).
 *
 * Thin wrapper over `editionService` so the web reader (`/squawk` and
 * `/squawk/[editionId]`) can list past editions and fetch a single issue
 * via React Query. All read-only — the write path lives in the MCP
 * `publishEdition` tool, not the web layer.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { editionService } from "@/server/services/edition-service";

export const editionRouter = createTRPCRouter({
	getById: publicProcedure.input(z.object({ id: z.string().uuid() })).query(async ({ input }) => {
		const result = await editionService.getEdition(input.id);
		if (!result.success) {
			throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
		}
		return result.data;
	}),

	getLatest: publicProcedure
		.input(z.object({ boardId: z.string().uuid() }))
		.query(async ({ input }) => {
			const result = await editionService.getLatestEdition(input.boardId);
			if (!result.success) {
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
			}
			return result.data;
		}),

	list: publicProcedure
		.input(
			z.object({
				boardId: z.string().uuid().optional(),
				limit: z.number().int().min(1).max(200).optional(),
			})
		)
		.query(async ({ input }) => {
			const result = await editionService.listEditions(input.boardId, input.limit);
			if (!result.success) {
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
			}
			return result.data;
		}),
});
