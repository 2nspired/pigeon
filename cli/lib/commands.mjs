/**
 * Slash-command install — the ONE implementation (port of
 * `install_slash_commands` from `scripts/connect.sh`).
 *
 * Copies `<home>/.claude/commands/*.md` (/brief-me, /handoff, /plan-card)
 * into the target project's `.claude/commands/`, as-is. Idempotent: a
 * pre-existing file with the same name is left untouched so local edits
 * survive re-runs.
 */

import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Pure install plan: which command files to copy vs. leave alone.
 *
 * @param {string[]} sourceNames    `.md` filenames shipped by the checkout.
 * @param {string[]} existingNames  Filenames already in the target dir.
 * @returns {{ install: string[], skip: string[] }}
 */
export function planCommandInstall(sourceNames, existingNames) {
	const existing = new Set(existingNames);
	const install = [];
	const skip = [];
	for (const name of sourceNames) {
		if (!name.endsWith(".md")) continue;
		(existing.has(name) ? skip : install).push(name);
	}
	return { install, skip };
}

/**
 * Install the checkout's slash commands into a project.
 *
 * @param {{ home: string, targetDir: string }} options
 * @returns {{ installed: string[], skipped: string[] }}
 */
export function installSlashCommands({ home, targetDir }) {
	const sourceDir = join(home, ".claude", "commands");
	const destDir = join(targetDir, ".claude", "commands");

	if (!existsSync(sourceDir)) return { installed: [], skipped: [] };
	const sourceNames = readdirSync(sourceDir).filter((name) => name.endsWith(".md"));
	if (sourceNames.length === 0) return { installed: [], skipped: [] };

	const existingNames = existsSync(destDir) ? readdirSync(destDir) : [];
	const plan = planCommandInstall(sourceNames, existingNames);

	if (plan.install.length > 0) mkdirSync(destDir, { recursive: true });
	for (const name of plan.install) {
		copyFileSync(join(sourceDir, name), join(destDir, name));
	}
	return { installed: plan.install, skipped: plan.skip };
}
