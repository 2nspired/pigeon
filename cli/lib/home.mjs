/**
 * The Pigeon home checkout — a full git clone the app actually runs from.
 *
 * `pigeon init` deliberately does NOT ship the app on npm: the launchd plist
 * points at a directory, `pigeon-start.sh` execs `tsx` out of that
 * directory's `node_modules`, and updates flow through `git pull` +
 * `npm run service:update`. So this module's whole job is to make
 * `~/.pigeon` (or `$PIGEON_HOME`) exist, be a Pigeon checkout, have deps
 * installed, and have its SQLite schema migrated.
 *
 * Release-tag constraint (#314 Phase B): the default clone ref is the latest
 * `vX.Y.Z` release tag, but releases up to and including v6.6.0 predate the
 * native migrations helper (`scripts/db-migrate.ts`, Phase A). Rather than
 * silently falling back to that checkout's legacy `db push` path — which the
 * schema engine can't run against a DB any MCP server has touched — init
 * fails with a message naming the fix (`--ref main` until the first
 * post-v6.6.0 release is tagged).
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { run } from "./exec.mjs";

export const PIGEON_REPO_URL = "https://github.com/2nspired/pigeon";
export const MIGRATE_HELPER = "scripts/db-migrate.ts";
/** Newest release that does NOT support `pigeon init` (predates Phase A). */
export const LAST_UNSUPPORTED_RELEASE = "v6.6.0";

/** Package names the home checkout may carry (post/pre-rebrand). */
const PIGEON_PACKAGE_NAMES = new Set(["pigeon-mcp", "project-tracker"]);

/**
 * Resolve the home checkout path: `--home` flag, then `PIGEON_HOME`, then
 * `~/.pigeon`.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {string | null} [homeFlag]
 */
export function resolvePigeonHome(env = process.env, homeFlag = null) {
	if (homeFlag) return resolve(homeFlag);
	if (env.PIGEON_HOME) return resolve(env.PIGEON_HOME);
	return join(homedir(), ".pigeon");
}

/**
 * Release tags (`vX.Y.Z`, no pre-releases) out of `git ls-remote --tags`
 * output. Peeled `^{}` refs are folded into their tag name.
 *
 * @param {string} lsRemoteOutput
 * @returns {string[]}
 */
export function parseReleaseTags(lsRemoteOutput) {
	const tags = new Set();
	for (const line of lsRemoteOutput.split("\n")) {
		const match = /refs\/tags\/(v\d+\.\d+\.\d+)(\^\{\})?$/.exec(line.trim());
		if (match) tags.add(match[1]);
	}
	return [...tags];
}

/**
 * Numeric semver compare for `vX.Y.Z` tags. Positive when `a > b`.
 *
 * @param {string} a
 * @param {string} b
 */
export function compareReleaseTags(a, b) {
	const pa = a.slice(1).split(".").map(Number);
	const pb = b.slice(1).split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if (pa[i] !== pb[i]) return pa[i] - pb[i];
	}
	return 0;
}

/**
 * Highest release tag, or null when none exist.
 *
 * @param {string[]} tags
 * @returns {string | null}
 */
export function latestReleaseTag(tags) {
	if (tags.length === 0) return null;
	return tags.reduce((best, tag) => (compareReleaseTags(tag, best) > 0 ? tag : best));
}

/**
 * Classify what's at the home path. Pure given the answers, unit-tested via
 * the wrapper below.
 *
 * @param {{ exists: boolean, empty: boolean, hasGitDir: boolean, packageName: string | null }} probe
 * @returns {"clone" | "reuse" | "conflict"}
 */
export function planHomeCheckout(probe) {
	if (!probe.exists || probe.empty) return "clone";
	if (probe.hasGitDir && probe.packageName !== null && PIGEON_PACKAGE_NAMES.has(probe.packageName)) {
		return "reuse";
	}
	return "conflict";
}

/**
 * @param {string} home
 * @returns {"clone" | "reuse" | "conflict"}
 */
export function inspectHome(home) {
	const exists = existsSync(home);
	let empty = false;
	let hasGitDir = false;
	let packageName = null;
	if (exists) {
		empty = readdirSync(home).length === 0;
		hasGitDir = existsSync(join(home, ".git"));
		const packageJson = join(home, "package.json");
		if (existsSync(packageJson)) {
			try {
				const parsed = JSON.parse(readFileSync(packageJson, "utf8"));
				if (typeof parsed?.name === "string") packageName = parsed.name;
			} catch {
				// Unreadable package.json → treated as a conflict below.
			}
		}
	}
	return planHomeCheckout({ exists, empty, hasGitDir, packageName });
}

/**
 * Ensure the home checkout exists. Returns what happened plus the ref used.
 *
 * @param {{ home: string, ref: string | null, repoUrl?: string }} options
 * @returns {{ status: "cloned" | "reused", ref: string | null }}
 */
export function ensureHomeCheckout({ home, ref, repoUrl = PIGEON_REPO_URL }) {
	const plan = inspectHome(home);

	if (plan === "reuse") {
		return { status: "reused", ref: null };
	}
	if (plan === "conflict") {
		throw new Error(
			`${home} exists but is not a Pigeon checkout. ` +
				`Move it aside, or point --home / PIGEON_HOME somewhere else.`,
		);
	}

	let cloneRef = ref;
	if (!cloneRef) {
		const lsRemote = run("git", ["ls-remote", "--tags", repoUrl], { capture: true });
		cloneRef = latestReleaseTag(parseReleaseTags(lsRemote.stdout));
		if (!cloneRef) {
			throw new Error(
				`No release tags found at ${repoUrl}. Pass --ref <branch|tag> (e.g. --ref main).`,
			);
		}
	}

	run("git", ["clone", "--depth", "1", "--branch", cloneRef, repoUrl, home]);
	return { status: "cloned", ref: cloneRef };
}

/**
 * Error text for a checkout that predates the Phase-A migrations helper.
 * Exported so the message stays pinned by a unit test.
 *
 * @param {string} home
 * @param {string | null} ref
 */
export function unsupportedCheckoutMessage(home, ref) {
	const refLabel = ref ? `ref ${ref}` : "this checkout";
	return (
		`Pigeon at ${home} (${refLabel}) predates \`pigeon init\` — it has no ` +
		`${MIGRATE_HELPER}, which ships in releases after ${LAST_UNSUPPORTED_RELEASE}. ` +
		`Re-run with \`npx @2nspired/pigeon init --ref main\` (or a newer release tag once one exists), ` +
		`or update the checkout: cd ${home} && git pull.`
	);
}

/**
 * `npm install` in the home checkout (idempotent; Prisma's postinstall
 * regenerates the client).
 *
 * @param {string} home
 */
export function installHomeDeps(home) {
	run("npm", ["install"], { cwd: home });
}

/**
 * Apply pending migrations by invoking the Phase-A helper from the home
 * checkout. Throws with a named minimum release when the checkout predates
 * the helper (see module docs).
 *
 * @param {{ home: string, ref: string | null }} options
 */
export function applyHomeMigrations({ home, ref }) {
	if (!existsSync(join(home, MIGRATE_HELPER))) {
		throw new Error(unsupportedCheckoutMessage(home, ref));
	}
	run("npx", ["tsx", MIGRATE_HELPER], { cwd: home });
}
