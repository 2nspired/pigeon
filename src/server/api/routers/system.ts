import { TOOL_CATALOG } from "@/lib/tool-catalog.generated";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import pkg from "../../../../package.json";

const startedAt = new Date().toISOString();

export const systemRouter = createTRPCRouter({
	info: publicProcedure.query(() => ({
		version: pkg.version,
		mode: process.env.NODE_ENV === "production" ? ("service" as const) : ("dev" as const),
		startedAt,
	})),

	// Returns the full MCP tool catalog. Sourced from a build-time
	// generated file (scripts/sync-tool-catalog.ts) so the Next.js process
	// never imports MCP runtime code — keeping it free of NodeNext-style
	// .js extensions Webpack/Turbopack can't resolve, and avoiding a
	// duplicate Prisma client. CI gate: `npm run catalog:check`.
	toolCatalog: publicProcedure.query(() => TOOL_CATALOG),
});
