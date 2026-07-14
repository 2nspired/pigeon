#!/usr/bin/env node
/**
 * `pigeon` — the published bootstrap for Pigeon (#314 Phase B).
 *
 *   npx @2nspired/pigeon init           full install (home checkout, DB, MCP,
 *                                       project bind, macOS service, doctor)
 *   npx @2nspired/pigeon connect [dir]  bind a project to an existing install
 *
 * This package is deliberately thin: Node built-ins only, no build step. The
 * app itself runs from the git checkout `init` creates — see cli/lib/home.mjs
 * for why it isn't shipped on npm.
 */

import { existsSync } from "node:fs";
import { parseCliArgs, USAGE } from "../lib/args.mjs";
import { connectProject, printConnectSnippet } from "../lib/connect.mjs";
import { resolvePigeonHome } from "../lib/home.mjs";
import { runInit } from "../lib/init.mjs";
import * as ui from "../lib/ui.mjs";

function main() {
	const args = parseCliArgs(process.argv.slice(2));

	if (args.help || (args.command === null && args.errors.length === 0)) {
		console.log(USAGE);
		return 0;
	}
	if (args.errors.length > 0) {
		for (const error of args.errors) console.error(ui.color("red", `error: ${error}`));
		console.error(`\n${USAGE}`);
		return 1;
	}

	if (args.command === "init") {
		runInit(args);
		return 0;
	}

	// connect: requires an existing home checkout.
	const home = resolvePigeonHome(process.env, args.home);
	if (!existsSync(home)) {
		console.error(
			ui.color("red", `error: no Pigeon checkout at ${home} — run \`npx @2nspired/pigeon init\` first.`),
		);
		return 1;
	}
	const target = args.target ?? process.cwd();
	const project = connectProject({
		home,
		targetDir: target,
		agentName: args.agentName,
		register: args.register,
		writeMcpJson: true,
	});
	if (project) printConnectSnippet(home);
	return 0;
}

try {
	process.exit(main());
} catch (err) {
	console.error(ui.color("red", `\npigeon: ${err instanceof Error ? err.message : err}`));
	process.exit(1);
}
