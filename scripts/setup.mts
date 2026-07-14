/**
 * Interactive setup wizard for Pigeon.
 * Guides the user through database creation, tutorial project seeding,
 * and connecting an external project to the MCP server.
 *
 * Step 3 delegates to the shared `pigeon` CLI modules (cli/lib/) — the single
 * implementation of .mcp.json writing, slash-command install, Stop-hook
 * install, and repo registration (#314 Phase B).
 *
 * No extra dependencies — uses Node's built-in readline.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline";

const DB_PATH = resolve("data", "tracker.db");
const TRACKER_ROOT = resolve(import.meta.dirname, "..");

const rl = createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string, fallback = ""): Promise<string> {
	return new Promise((resolve) => {
		rl.question(question, (answer) => {
			resolve(answer.trim() || fallback);
		});
	});
}

async function askYesNo(question: string, defaultYes = true): Promise<boolean> {
	const hint = defaultYes ? "Y/n" : "y/N";
	const answer = await ask(`${question} (${hint}) `);
	if (!answer) return defaultYes;
	return answer.toLowerCase().startsWith("y");
}

async function main() {
	console.log("");
	console.log("┌─────────────────────────────────────────┐");
	console.log("│            Pigeon — Setup               │");
	console.log("└─────────────────────────────────────────┘");
	console.log("");

	// ─── Step 1: Database ─────────────────────────────────────────────

	console.log("Step 1: Database");

	const { runMigrations } = await import("./db-migrate.js");
	if (existsSync(DB_PATH)) {
		console.log("  ✓ SQLite database already exists — applying any pending migrations.");
	} else {
		console.log("  Creating SQLite database...");
	}
	runMigrations({ log: (msg) => console.log(`  ${msg}`) });
	console.log("  ✓ Database ready.");
	console.log("");

	// ─── Step 2: Tutorial Project ─────────────────────────────────────

	console.log("Step 2: Tutorial Project");

	const { seedTutorialProject } = await import("../src/lib/onboarding/seed-runner.js");

	// Need to create a PrismaClient for the seed runner
	const { PrismaClient } = await import("prisma/generated/client");
	const { PrismaBetterSqlite3 } = await import("@prisma/adapter-better-sqlite3");

	const adapter = new PrismaBetterSqlite3({ url: "file:./data/tracker.db" });
	const db = new PrismaClient({ adapter });

	// Check if tutorial already exists
	const existingTutorial = await db.project.findUnique({
		where: { slug: "learn-project-tracker" },
	});

	if (existingTutorial) {
		console.log("  ✓ Tutorial project already exists.");
	} else {
		const wantTutorial = await askYesNo("  Create a tutorial project with sample cards?");
		if (wantTutorial) {
			const result = await seedTutorialProject(db);
			if (result) {
				console.log("  ✓ Tutorial project created.");
				console.log(`    Board ID: ${result.boardId}`);
			}
		} else {
			console.log("  Skipped.");
		}
	}
	console.log("");

	// ─── Step 3: Connect a Project ────────────────────────────────────

	console.log("Step 3: Connect a Project");
	console.log("  Link an external project so its AI agents can use Pigeon via MCP.");

	const projectPath = await ask("  Path to your project (or press Enter to skip): ");

	if (projectPath) {
		const targetDir = resolve(projectPath);

		if (!existsSync(targetDir)) {
			console.log(`  ✗ Directory not found: ${targetDir}`);
		} else {
			const agentName = await ask("  Agent name (default: Claude): ", "Claude");
			// Shared implementation with `pigeon init` / `pigeon connect` /
			// scripts/connect.sh — registers the repo, writes a starter
			// tracker.md, installs slash commands + Stop hook, and creates or
			// merges .mcp.json.
			const { connectProject } = await import("../cli/lib/connect.mjs");
			try {
				connectProject({ home: TRACKER_ROOT, targetDir, agentName });
			} catch (err) {
				console.log(`  ✗ ${err instanceof Error ? err.message : err}`);
			}
		}
	} else {
		console.log("  Skipped. You can connect projects later with:");
		console.log(`    ${TRACKER_ROOT}/scripts/connect.sh /path/to/your-project`);
	}
	console.log("");

	// ─── Done ─────────────────────────────────────────────────────────

	console.log("┌──────────────────────────────────────────────────────┐");
	console.log("│  ✓ Setup complete!                                   │");
	console.log("│                                                      │");
	console.log("│  Run it now (foreground):                            │");
	console.log("│    npm run dev          → http://localhost:3000      │");
	console.log("│                                                      │");
	console.log("│  Run it always (macOS launchd background service):   │");
	console.log("│    npm run service:install                           │");
	console.log("│                         → http://localhost:3100      │");
	console.log("│    npm run service:status                            │");
	console.log("│    npm run service:logs                              │");
	console.log("└──────────────────────────────────────────────────────┘");
	console.log("");

	await db.$disconnect();
	rl.close();
}

main().catch((err) => {
	console.error(err);
	rl.close();
	process.exit(1);
});
