/**
 * CLI entry point for seeding the tutorial project.
 * Run: npm run db:seed
 */

import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "./generated/client";
import { seedTutorialProject } from "../src/lib/onboarding/seed-runner";

async function main() {
	const adapter = new PrismaBetterSqlite3({
		url: "file:./data/tracker.db",
	});

	const db = new PrismaClient({ adapter });

	try {
		const result = await seedTutorialProject(db);

		if (result) {
			console.log("Tutorial project created successfully");
			console.log(`  Project ID: ${result.projectId}`);
			console.log(`  Board ID:   ${result.boardId}`);
		} else {
			console.log("Tutorial project already exists (skipped)");
		}
	} finally {
		await db.$disconnect();
	}
}

main().catch((error) => {
	console.error("Seed failed:", error);
	process.exit(1);
});
