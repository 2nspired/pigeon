import { z } from "zod";
import { db } from "../db.js";
import { initFts5, queryKnowledge } from "../fts.js";
import { registerExtendedTool } from "../tool-registry.js";
import { ok, err, safeExecute } from "../utils.js";

// ─── Knowledge Search Tools ──────────────────────────────────────

registerExtendedTool("queryKnowledge", {
	category: "context",
	description:
		"Full-text search across all project knowledge: cards, comments, decisions, notes, handoffs, code facts, context entries, and indexed repo markdown files. Index is auto-initialized on first query.",
	parameters: z.object({
		projectId: z.string().describe("Project UUID"),
		topic: z.string().describe("Search query — natural language or keywords"),
		limit: z.number().int().min(1).max(100).default(20).describe("Max results to return"),
	}),
	annotations: { readOnlyHint: true },
	handler: ({ projectId, topic, limit }) =>
		safeExecute(async () => {
			const project = await db.project.findUnique({ where: { id: projectId as string } });
			if (!project) return err("Project not found.", "Use listProjects to find a valid projectId.");

			// Ensure FTS5 table exists
			await initFts5();

			const results = await queryKnowledge(projectId as string, topic as string, (limit as number) ?? 20);

			if (results.length === 0) {
				return ok({
					results: [],
					total: 0,
					hint: "No results found. Try broader search terms.",
				});
			}

			return ok({
				results,
				total: results.length,
			});
		}),
});

