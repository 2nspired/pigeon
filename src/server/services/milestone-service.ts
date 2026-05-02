/**
 * Thin web-side shim over the shared milestone service.
 *
 * The actual implementation lives in `src/lib/services/milestone.ts` so
 * the MCP process can use it without crossing the `src/server/` ↔
 * `src/mcp/` layer boundary (v6.2 decision a5a4cde6 — `src/lib/services/`
 * owns shared logic; both processes pass their own `PrismaClient`).
 * Mirrors the `src/server/services/tag-service.ts` shim pattern from
 * cluster 1 of #260.
 *
 * Web callers (tRPC milestone router) keep the `milestoneService`
 * singleton bound to the FTS-extended Next.js db.
 */

import {
	createMilestoneService,
	type MilestoneGovernanceHints,
	type MilestoneResolveResult,
	type MilestoneService,
	type MilestoneWithCounts,
	resolveOrCreateMilestone,
} from "@/lib/services/milestone";
import { db } from "@/server/db";

export {
	createMilestoneService,
	type MilestoneGovernanceHints,
	type MilestoneResolveResult,
	type MilestoneService,
	type MilestoneWithCounts,
	resolveOrCreateMilestone,
};

// Singleton bound to the Next.js db (FTS-extended). MCP code constructs
// its own instance via createMilestoneService(mcpDb) at module load.
export const milestoneService = createMilestoneService(db);
