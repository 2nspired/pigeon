/**
 * Smart dev script — ensures the database exists and is up to date before
 * starting Next.js. Runs the idempotent migrations helper (creates the DB
 * from `prisma/migrations/` if missing, baselines pre-migrations installs,
 * applies anything pending), then execs `next dev --turbopack`.
 */

import { execFileSync } from "node:child_process";
import { runMigrations } from "./db-migrate";

runMigrations();

// Replace this process with next dev
execFileSync("npx", ["next", "dev", "--turbopack"], { stdio: "inherit" });
