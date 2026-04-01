import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "prisma/generated/client";

const adapter = new PrismaBetterSqlite3({
	url: "file:./data/tracker.db",
});

const createPrismaClient = () =>
	new PrismaClient({
		adapter,
		log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
	});

const globalForPrisma = globalThis as unknown as {
	prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
