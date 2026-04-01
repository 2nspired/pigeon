import { initTRPC } from "@trpc/server";

import superjson from "superjson";
import { ZodError } from "zod";
import { db } from "@/server/db";

/**
 * 1. CONTEXT
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
	return {
		db,
		...opts,
	};
};

/**
 * 2. INITIALIZATION
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
	transformer: superjson,
	errorFormatter({ shape, error }) {
		return {
			...shape,
			data: {
				...shape.data,
				zodError: error.cause instanceof ZodError ? error.cause.flatten() : null,
			},
		};
	},
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;

/**
 * 3. PROCEDURES
 */
const timingMiddleware = t.middleware(async ({ next, path }) => {
	const start = Date.now();

	if (t._config.isDev) {
		const waitMs = Math.floor(Math.random() * 100) + 50;
		await new Promise((resolve) => setTimeout(resolve, waitMs));
	}

	const result = await next();

	const end = Date.now();
	console.log(`[TRPC] ${path} took ${end - start}ms to execute`);

	return result;
});

export const publicProcedure = t.procedure.use(timingMiddleware);
