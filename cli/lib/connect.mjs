/**
 * Project connection — the shared implementation behind `pigeon init` (when
 * run inside a project repo), `pigeon connect`, `scripts/connect.sh`, and
 * `scripts/setup.mts` step 3.
 *
 * Steps (each independently idempotent):
 *   1. Register the repo with Pigeon (`scripts/register-repo.ts` in the home
 *      checkout) so `Project.repoPath` is set and briefMe auto-detection
 *      works — the #154 failure mode this CLI exists to close.
 *   2. Starter `tracker.md` at the repo root (if absent).
 *   3. Slash commands into `.claude/commands/` (existing files untouched).
 *   4. Token-tracking Stop hook into user-level settings.json.
 *   5. Optionally a project-scoped `.mcp.json` (the fallback when user-scope
 *      `claude mcp add` isn't used).
 */

import { existsSync, realpathSync } from "node:fs";
import { basename, join } from "node:path";
import { installSlashCommands } from "./commands.mjs";
import { commandOnPath, run } from "./exec.mjs";
import { manualMcpSnippet, writeProjectMcpJson } from "./mcp-config.mjs";
import { installStopHook, resolveUserSettingsPath } from "./stop-hook.mjs";
import { writeStarterTrackerMd } from "./tracker-template.mjs";
import * as ui from "./ui.mjs";

/**
 * Git toplevel for `dir`, or null when not in a repo.
 *
 * @param {string} dir
 */
export function detectGitRoot(dir) {
	const result = run("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
		capture: true,
		allowFailure: true,
	});
	if (result.status !== 0) return null;
	const top = result.stdout.trim();
	return top ? realpathSync(top) : null;
}

/**
 * Connect a project directory to a Pigeon home checkout.
 *
 * @param {{
 *   home: string,
 *   targetDir: string,
 *   agentName?: string,
 *   register?: boolean,
 *   writeMcpJson?: boolean,
 * }} options
 * @returns {{ projectRoot: string | null, registered: boolean }}
 */
export function connectProject({
	home,
	targetDir,
	agentName = "Claude",
	register = true,
	writeMcpJson = true,
}) {
	const resolvedTarget = realpathSync(targetDir);
	if (resolvedTarget === realpathSync(home)) {
		throw new Error(
			"That's the Pigeon checkout itself — run this from the project you want to connect.",
		);
	}

	const gitRoot = detectGitRoot(resolvedTarget);
	const projectRoot = gitRoot ?? resolvedTarget;
	const projectName = basename(projectRoot);
	let registered = false;

	// 1. Repo registration — sets Project.repoPath so briefMe auto-detects.
	if (!gitRoot) {
		ui.warn(`${resolvedTarget} is not inside a git repo — skipping registration.`);
		ui.info("briefMe auto-detection needs a git root; run `git init` and re-run.");
	} else if (!register) {
		ui.skip("Repo registration skipped (--no-register).");
	} else {
		// Non-fatal: the remaining steps (tracker.md, commands, hook, .mcp.json)
		// are still worth landing, and registration can be redone from a
		// session via registerRepo (see docs/AGENT-GUIDE.md).
		try {
			run("npx", ["tsx", "scripts/register-repo.ts", gitRoot, projectName], { cwd: home });
			registered = true;
		} catch (err) {
			ui.warn(`Repo registration failed: ${err instanceof Error ? err.message : err}`);
			ui.info("Fix the install (npm run doctor in the checkout), then re-run connect.");
		}
	}

	// 2. Starter tracker.md.
	const trackerStatus = writeStarterTrackerMd({ targetDir: projectRoot, projectName });
	if (trackerStatus === "created") {
		ui.ok(`Starter tracker.md written to ${join(projectRoot, "tracker.md")} — edit it, agents read it live.`);
	} else {
		ui.skip("tracker.md already present (left as-is).");
	}

	// 3. Slash commands.
	const commands = installSlashCommands({ home, targetDir: projectRoot });
	if (commands.installed.length > 0) {
		ui.ok(
			`Installed ${commands.installed.map((n) => `/${n.replace(/\.md$/, "")}`).join(" ")} into .claude/commands/.`,
		);
	}
	if (commands.skipped.length > 0) {
		ui.skip(
			`Slash commands already present: ${commands.skipped.map((n) => `/${n.replace(/\.md$/, "")}`).join(" ")}.`,
		);
	}

	// 4. Stop hook (user-level, once per machine).
	const settingsPath = resolveUserSettingsPath();
	const hook = installStopHook({
		settingsPath,
		hookCommand: join(home, "scripts", "stop-hook.sh"),
	});
	if (hook.status === "installed") {
		ui.ok(`Token-tracking Stop hook installed into ${settingsPath}.`);
	} else if (hook.status === "already-installed") {
		ui.skip(`Stop hook already installed in ${settingsPath}.`);
	} else {
		ui.warn(`Could not install the Stop hook: ${hook.detail}`);
	}

	// 5. Project-scoped .mcp.json (fallback / connect path).
	if (writeMcpJson) {
		const mcpStatus = writeProjectMcpJson({ targetDir: projectRoot, home, agentName });
		if (mcpStatus === "created" || mcpStatus === "added") {
			ui.ok(`Pigeon MCP server ${mcpStatus === "created" ? "written to" : "added to"} ${join(projectRoot, ".mcp.json")}.`);
		} else if (mcpStatus === "already-configured") {
			ui.skip(".mcp.json already lists Pigeon (left as-is).");
		} else {
			ui.warn(`.mcp.json exists but isn't valid JSON — add this under "mcpServers" yourself:`);
			console.log(manualMcpSnippet(home));
		}
	}

	return { projectRoot, registered };
}

/**
 * Print the CLAUDE.md snippet (derived from the live tool manifest by the
 * home checkout — see scripts/print-connect-snippet.ts, #187). Non-fatal.
 *
 * @param {string} home
 */
export function printConnectSnippet(home) {
	if (!existsSync(join(home, "scripts", "print-connect-snippet.ts"))) return;
	if (!commandOnPath("npx")) return;
	console.log("");
	console.log("Snippet for this project's CLAUDE.md / AGENTS.md:");
	console.log("");
	run("npx", ["tsx", "scripts/print-connect-snippet.ts"], { cwd: home, allowFailure: true });
}
