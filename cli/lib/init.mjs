/**
 * `pigeon init` — the whole install, in order, zero questions:
 *
 *   a. Home checkout at ~/.pigeon (PIGEON_HOME / --home; latest release tag,
 *      --ref override)
 *   b. npm install in the checkout
 *   c. Apply DB migrations via the checkout's own Phase-A helper
 *   d. Register the MCP server with Claude Code (user scope via
 *      `claude mcp add`; project .mcp.json fallback)
 *   e. Inside a project repo: repo registration + starter tracker.md +
 *      slash commands + Stop hook
 *   f. macOS: launchd service install (opt out with --no-service)
 *   g. Doctor pass + colophon summary
 */

import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { connectProject, detectGitRoot, printConnectSnippet } from "./connect.mjs";
import { commandOnPath, run } from "./exec.mjs";
import {
	applyHomeMigrations,
	ensureHomeCheckout,
	installHomeDeps,
	resolvePigeonHome,
} from "./home.mjs";
import { buildClaudeMcpAddArgs, buildClaudeMcpGetArgs } from "./mcp-config.mjs";
import * as ui from "./ui.mjs";

const SERVICE_PLIST = "Library/LaunchAgents/com.2nspired.pigeon.plist";
const BOARD_URL = "http://localhost:3100";

/**
 * Register the MCP server in Claude Code user scope. Returns true when user
 * scope now covers this machine (so no project `.mcp.json` is needed).
 *
 * @param {{ home: string, agentName: string, useClaude: boolean }} options
 */
export function registerUserScope({ home, agentName, useClaude }) {
	if (!useClaude) {
		ui.skip("Claude Code user-scope registration skipped (--no-claude).");
		return false;
	}
	if (!commandOnPath("claude")) {
		ui.skip("`claude` not on PATH — falling back to a project-scoped .mcp.json.");
		return false;
	}

	const probe = run("claude", buildClaudeMcpGetArgs(), { capture: true, allowFailure: true });
	if (probe.status === 0) {
		ui.skip("Pigeon is already registered with Claude Code.");
		return true;
	}

	const add = run("claude", buildClaudeMcpAddArgs(home, agentName), {
		capture: true,
		allowFailure: true,
	});
	if (add.status === 0) {
		ui.ok("Registered the Pigeon MCP server with Claude Code (user scope).");
		return true;
	}
	ui.warn(`\`claude mcp add\` failed — falling back to a project-scoped .mcp.json.`);
	if (add.stderr.trim()) ui.info(add.stderr.trim());
	return false;
}

/**
 * @param {import("./args.mjs").CliArgs} args
 * @param {{ cwd?: string, platform?: NodeJS.Platform }} [context]
 */
export function runInit(args, context = {}) {
	const cwd = context.cwd ?? process.cwd();
	const platform = context.platform ?? process.platform;
	const home = resolvePigeonHome(process.env, args.home);

	// ─── a. Home checkout ────────────────────────────────────────────
	ui.step("1/6 · Pigeon home checkout");
	const checkout = ensureHomeCheckout({ home, ref: args.ref });
	if (checkout.status === "cloned") {
		ui.ok(`Cloned ${checkout.ref} into ${home}.`);
	} else {
		ui.skip(`Using the existing checkout at ${home}.`);
		ui.info(`Update it any time: cd ${home} && git pull && npm run service:update`);
	}

	// ─── b. Dependencies ─────────────────────────────────────────────
	ui.step("2/6 · Dependencies");
	installHomeDeps(home);
	ui.ok("npm install complete (Prisma client generated).");

	// ─── c. Database migrations ──────────────────────────────────────
	ui.step("3/6 · Database");
	applyHomeMigrations({ home, ref: args.ref ?? checkout.ref });
	ui.ok("Database ready.");

	// ─── d. MCP registration ─────────────────────────────────────────
	ui.step("4/6 · Claude Code");
	const userScope = registerUserScope({
		home,
		agentName: args.agentName,
		useClaude: args.claude,
	});

	// ─── e. Project connection ───────────────────────────────────────
	ui.step("5/6 · This project");
	const gitRoot = detectGitRoot(cwd);
	const insideHome = gitRoot !== null && resolve(gitRoot) === resolve(home);
	let project = null;
	if (gitRoot && !insideHome) {
		project = connectProject({
			home,
			targetDir: cwd,
			agentName: args.agentName,
			register: args.register,
			writeMcpJson: !userScope,
		});
	} else if (insideHome) {
		ui.skip("You're inside the Pigeon checkout itself — no project to connect here.");
	} else {
		ui.skip("Not inside a git repo — no project connected.");
		ui.info("Later, from any project: npx @2nspired/pigeon connect");
	}
	if (!userScope && !project) {
		ui.info("No .mcp.json written either — run `connect` from a project to get one.");
	}

	// ─── f. Background service ───────────────────────────────────────
	ui.step("6/6 · Board service");
	if (platform !== "darwin") {
		ui.skip("Background service is macOS-only on this release.");
		ui.info(`Run the board in the foreground: cd ${home} && npm run dev`);
	} else if (!args.service) {
		ui.skip("Service install skipped (--no-service).");
		ui.info(`Install it later: cd ${home} && npm run service:install`);
	} else if (existsSync(join(homedir(), SERVICE_PLIST))) {
		ui.skip(`Service already installed — board at ${BOARD_URL}.`);
	} else {
		run("npm", ["run", "service:install"], { cwd: home });
		ui.ok(`Board running at ${BOARD_URL} (launchd keeps it alive).`);
	}

	// ─── g. Doctor + colophon ────────────────────────────────────────
	if (existsSync(join(home, "scripts", "doctor.ts"))) {
		const doctor = run("npx", ["tsx", "scripts/doctor.ts"], { cwd: home, allowFailure: true });
		if (doctor.status !== 0) {
			ui.warn("Doctor flagged issues above — each comes with a copy-pasteable fix.");
		}
	}

	if (project) printConnectSnippet(home);

	printColophon({ home, platform, project, service: args.service });
}

/**
 * Closing summary in colophon voice (#310): brief, warm, factual.
 *
 * @param {{ home: string, platform: NodeJS.Platform, project: { projectRoot: string | null, registered: boolean } | null, service: boolean }} options
 */
function printColophon({ home, platform, project, service }) {
	const line = "─".repeat(56);
	console.log("");
	console.log(ui.color("dim", line));
	console.log(`Pigeon lives in ${home}.`);
	if (platform === "darwin" && service) {
		console.log(`The board is at ${BOARD_URL} — it survives reboots.`);
	}
	if (project?.registered) {
		console.log("This repo is registered; briefMe() will find it by path.");
		console.log('Open Claude Code here and say "brief me" to start.');
	} else if (project) {
		console.log("This repo is connected. Register it any time with /brief-me.");
	}
	console.log(`Update later: cd ${home} && git pull && npm run service:update`);
	console.log(ui.color("dim", line));
	console.log("");
}
