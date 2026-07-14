/**
 * MCP registration — the ONE implementation of `.mcp.json` writing (used by
 * `pigeon init`, `pigeon connect`, `scripts/connect.sh`, and
 * `scripts/setup.mts`) plus the `claude mcp add` command construction for the
 * preferred user-scope path.
 *
 * Per #154: NEVER hand-edit `~/.claude.json`. User-scope registration always
 * shells out to the `claude` CLI; the only file this module writes is a
 * project-scoped `.mcp.json`, which is a documented, project-owned surface.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const MCP_SERVER_KEY = "pigeon";
/** Pre-rebrand key — presence means "already configured", never rewritten here. */
export const LEGACY_MCP_KEY = "project-tracker";

/**
 * Canonical MCP launch command for a home checkout.
 *
 * @param {string} home
 */
export function pigeonStartCommand(home) {
	return join(home, "scripts", "pigeon-start.sh");
}

/**
 * The `.mcp.json` server entry — same shape `scripts/connect.sh` has always
 * written.
 *
 * @param {string} home
 * @param {string} [agentName]
 */
export function pigeonServerEntry(home, agentName = "Claude") {
	return {
		command: pigeonStartCommand(home),
		args: [],
		env: { AGENT_NAME: agentName },
	};
}

/**
 * argv (after the binary name) for user-scope registration via the Claude
 * Code CLI: `claude mcp add --scope user … pigeon -- <pigeon-start.sh>`.
 *
 * @param {string} home
 * @param {string} [agentName]
 * @returns {string[]}
 */
export function buildClaudeMcpAddArgs(home, agentName = "Claude") {
	return [
		"mcp",
		"add",
		"--scope",
		"user",
		"--env",
		`AGENT_NAME=${agentName}`,
		MCP_SERVER_KEY,
		"--",
		pigeonStartCommand(home),
	];
}

/** argv to probe whether the server is already registered with Claude Code. */
export function buildClaudeMcpGetArgs() {
	return ["mcp", "get", MCP_SERVER_KEY];
}

/**
 * Decide what to do with a project's `.mcp.json`. Pure — `rawText` is the
 * current file contents or null when the file doesn't exist.
 *
 * @param {string | null} rawText
 * @param {object} entry  Server entry from {@link pigeonServerEntry}.
 * @returns {{ status: "create" | "add" | "already-configured" | "unparseable", json?: object }}
 */
export function planMcpJsonUpdate(rawText, entry) {
	if (rawText === null || rawText.trim() === "") {
		return { status: "create", json: { mcpServers: { [MCP_SERVER_KEY]: entry } } };
	}

	let parsed;
	try {
		parsed = JSON.parse(rawText);
	} catch {
		return { status: "unparseable" };
	}
	if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
		return { status: "unparseable" };
	}

	const servers = parsed.mcpServers;
	if (servers && typeof servers === "object" && !Array.isArray(servers)) {
		if (MCP_SERVER_KEY in servers || LEGACY_MCP_KEY in servers) {
			return { status: "already-configured" };
		}
	}

	const json = {
		...parsed,
		mcpServers: {
			...(servers && typeof servers === "object" && !Array.isArray(servers) ? servers : {}),
			[MCP_SERVER_KEY]: entry,
		},
	};
	return { status: "add", json };
}

/**
 * Create or merge `<targetDir>/.mcp.json` with the Pigeon server entry.
 * Atomic write (tempfile + rename); preserves every other key in the file.
 *
 * @param {{ targetDir: string, home: string, agentName?: string }} options
 * @returns {"created" | "added" | "already-configured" | "unparseable"}
 */
export function writeProjectMcpJson({ targetDir, home, agentName = "Claude" }) {
	const mcpFile = join(targetDir, ".mcp.json");
	const rawText = existsSync(mcpFile) ? readFileSync(mcpFile, "utf8") : null;
	const plan = planMcpJsonUpdate(rawText, pigeonServerEntry(home, agentName));

	if (plan.status === "create" || plan.status === "add") {
		const tmp = `${mcpFile}.pigeon.tmp`;
		writeFileSync(tmp, `${JSON.stringify(plan.json, null, 2)}\n`, "utf8");
		renameSync(tmp, mcpFile);
		return plan.status === "create" ? "created" : "added";
	}
	return plan.status;
}

/**
 * Manual snippet for the unparseable-`.mcp.json` case.
 *
 * @param {string} home
 */
export function manualMcpSnippet(home) {
	return JSON.stringify({ [MCP_SERVER_KEY]: pigeonServerEntry(home) }, null, 2);
}
