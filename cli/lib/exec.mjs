/**
 * Thin child-process helpers — Node built-ins only.
 */

import { spawnSync } from "node:child_process";

/**
 * Run a command synchronously.
 *
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, capture?: boolean, allowFailure?: boolean }} [options]
 * @returns {{ status: number | null, stdout: string, stderr: string }}
 */
export function run(cmd, args, options = {}) {
	const { cwd, env, capture = false, allowFailure = false } = options;
	const result = spawnSync(cmd, args, {
		cwd,
		env: env ?? process.env,
		stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
		encoding: "utf8",
	});
	if (result.error) throw result.error;
	if (result.status !== 0 && !allowFailure) {
		const detail = capture && result.stderr ? `\n${result.stderr.trim()}` : "";
		throw new Error(`\`${cmd} ${args.join(" ")}\` exited with code ${result.status}${detail}`);
	}
	return {
		status: result.status,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
	};
}

/**
 * True when `name` resolves on PATH.
 *
 * @param {string} name
 */
export function commandOnPath(name) {
	const probe = process.platform === "win32" ? "where" : "which";
	const result = spawnSync(probe, [name], { stdio: "ignore" });
	return result.status === 0;
}
