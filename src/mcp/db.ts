import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "prisma/generated/client";

const adapter = new PrismaBetterSqlite3({
	url: "file:./data/tracker.db",
});

export const db = new PrismaClient({
	adapter,
	log: ["error", "warn"],
});
