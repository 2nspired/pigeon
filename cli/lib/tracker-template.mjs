/**
 * Starter `tracker.md` — the runtime board-policy surface, hot-reloaded on
 * every MCP call. The template ships the day-one schema (schema_version 1)
 * with the optional keys present as commented examples, so a human can turn
 * policy on by uncommenting rather than by reading docs first.
 *
 * Must stay parseable by `loadTrackerPolicy` in
 * src/lib/services/tracker-policy.ts (front-matter + body).
 */

import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Same slug shape `scripts/register-repo.ts` derives from the project name.
 *
 * @param {string} name
 */
export function slugify(name) {
	return name
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "");
}

/**
 * @param {string} projectName
 * @returns {string}
 */
export function starterTrackerMd(projectName) {
	const slug = slugify(projectName) || "my-project";
	return `---
schema_version: 1
project_slug: ${slug}
# Require a short \`intent\` (the "why", ≤120 chars) on these MCP tools:
# intent_required_on:
#   - moveCard
#   - deleteCard
# Per-column guidance agents see when moving cards:
# columns:
#   "In Progress":
#     prompt: Move a card here before starting work on it, with a short intent.
---

${projectName} — describe the project in a few sentences: what it is, what
"done" looks like, and anything an AI agent should know before touching the
board. Agents read this file on every MCP call, so edits take effect
immediately. Keep it short; the board itself carries the work.
`;
}

/**
 * Write a starter `tracker.md` at the project root if absent.
 *
 * @param {{ targetDir: string, projectName: string }} options
 * @returns {"created" | "exists"}
 */
export function writeStarterTrackerMd({ targetDir, projectName }) {
	const path = join(targetDir, "tracker.md");
	if (existsSync(path)) return "exists";
	writeFileSync(path, starterTrackerMd(projectName), "utf8");
	return "created";
}
