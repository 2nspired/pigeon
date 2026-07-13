import type { PrismaConfig } from "prisma";

export default {
	schema: "prisma/schema.prisma",
	datasource: {
		// DATABASE_URL lets scripts and tests point the Prisma CLI at a
		// scratch DB (see scripts/db-migrate.ts); default is the live file.
		url: process.env.DATABASE_URL ?? "file:./data/tracker.db",
	},
} satisfies PrismaConfig;
