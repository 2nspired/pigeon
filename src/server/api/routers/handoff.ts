import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createHandoffSchema } from "@/lib/schemas/handoff-schemas";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { handoffService } from "@/server/services/handoff-service";
import { tokenUsageService } from "@/server/services/token-usage-service";

export const handoffRouter = createTRPCRouter({
	save: publicProcedure.input(createHandoffSchema).mutation(async ({ input }) => {
		const result = await handoffService.save(input);
		if (!result.success) {
			throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
		}
		return result.data;
	}),

	getLatest: publicProcedure
		.input(z.object({ boardId: z.string().uuid() }))
		.query(async ({ input }) => {
			const result = await handoffService.getLatest(input.boardId);
			if (!result.success) {
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
			}
			return result.data;
		}),

	// #292 — each row carries an optional `cost: HandoffCost | null` rolled
	// up from the (prevHandoff.createdAt, handoff.createdAt] window. Per-row
	// enrichment is N round-trips bounded by `limit` (≤50); a per-row failure
	// drops to `null` rather than failing the list, so a transient miss on
	// one row doesn't blank the sheet.
	list: publicProcedure
		.input(
			z.object({ boardId: z.string().uuid(), limit: z.number().int().min(1).max(50).optional() })
		)
		.query(async ({ input }) => {
			const result = await handoffService.list(input.boardId, input.limit);
			if (!result.success) {
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
			}
			const handoffs = result.data;
			const costs = await Promise.all(
				handoffs.map(async (h) => {
					const c = await tokenUsageService.getHandoffCost(h.id);
					return c.success ? c.data : null;
				})
			);
			return handoffs.map((h, i) => ({ ...h, cost: costs[i] }));
		}),

	getBoardDiff: publicProcedure
		.input(z.object({ boardId: z.string().uuid(), since: z.string().datetime() }))
		.query(async ({ input }) => {
			const result = await handoffService.getBoardDiff(input.boardId, new Date(input.since));
			if (!result.success) {
				throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.error.message });
			}
			return result.data;
		}),
});
