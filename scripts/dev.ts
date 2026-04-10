/**
 * Smart dev script — ensures the database exists before starting Next.js.
 * Checks for prisma/data/tracker.db, runs `prisma db push` if missing,
 * then execs `next dev --turbopack`.
 */

import { execSync, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const DB_PATH = resolve("data", "tracker.db");

if (!existsSync(DB_PATH)) {
	console.log("Database not found — running prisma db push...");
	execSync("npx prisma db push", { stdio: "inherit" });
	console.log("Database created.\n");
}

// Replace this process with next dev
execFileSync("npx", ["next", "dev", "--turbopack"], { stdio: "inherit" });
