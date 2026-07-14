/**
 * Stop-hook install — the ONE implementation (port of the inline Node script
 * that used to live in `scripts/connect.sh`, #217).
 *
 * Wires Pigeon's token-tracking Stop hook into the user-level Claude Code
 * `settings.json` once per machine. Idempotent: an existing hook whose
 * command ends in `stop-hook.sh` (any install path) is recognized and left
 * alone; everything else in the file is preserved.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * User-level settings.json to install the hook into. Order:
 *   1. `PIGEON_USER_SETTINGS` — explicit override; also the test/CI escape
 *      hatch so dry-runs never mutate a real settings file (#217).
 *   2. `$CLAUDE_CONFIG_DIR/settings.json` when the user relocated their
 *      Claude config.
 *   3. `~/.claude-alt/settings.json` when that directory exists (mirrors
 *      `resolveClaudeConfigPaths` in src/lib/doctor/config-paths.ts).
 *   4. `~/.claude/settings.json` — the default.
 *
 * @param {Record<string, string | undefined>} [env]
 * @param {string} [home]  Home directory override for tests.
 */
export function resolveUserSettingsPath(env = process.env, home = homedir()) {
	if (env.PIGEON_USER_SETTINGS) return resolve(env.PIGEON_USER_SETTINGS);
	if (env.CLAUDE_CONFIG_DIR) return resolve(env.CLAUDE_CONFIG_DIR, "settings.json");
	const claudeAlt = join(home, ".claude-alt");
	if (existsSync(claudeAlt)) return join(claudeAlt, "settings.json");
	return join(home, ".claude", "settings.json");
}

/**
 * True when the settings object already carries a Pigeon Stop hook. Matches
 * by suffix so moved checkouts are still recognized — mirrors
 * `configHasTokenHook()` in src/server/services/token-usage-service.ts.
 *
 * @param {unknown} settings
 */
export function hasPigeonStopHook(settings) {
	if (settings === null || typeof settings !== "object") return false;
	const stop = /** @type {{ hooks?: { Stop?: unknown } }} */ (settings).hooks?.Stop;
	if (!Array.isArray(stop)) return false;
	for (const group of stop) {
		const inner = group?.hooks;
		if (!Array.isArray(inner)) continue;
		for (const hook of inner) {
			if (
				hook &&
				typeof hook === "object" &&
				hook.type === "command" &&
				typeof hook.command === "string" &&
				(hook.command.endsWith("/stop-hook.sh") || hook.command.endsWith("\\stop-hook.sh"))
			) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Merge the Pigeon Stop hook into a settings object. Pure: returns a new
 * object; `changed: false` means the hook was already present.
 *
 * @param {Record<string, unknown>} settings
 * @param {string} hookCommand  Absolute path to `<home>/scripts/stop-hook.sh`.
 * @returns {{ changed: boolean, settings: Record<string, unknown> }}
 */
export function mergeStopHook(settings, hookCommand) {
	if (hasPigeonStopHook(settings)) return { changed: false, settings };

	const hooks =
		settings.hooks && typeof settings.hooks === "object" && !Array.isArray(settings.hooks)
			? { .../** @type {Record<string, unknown>} */ (settings.hooks) }
			: {};
	const stop = Array.isArray(hooks.Stop) ? [...hooks.Stop] : [];
	stop.push({ hooks: [{ type: "command", command: hookCommand }] });
	hooks.Stop = stop;

	return { changed: true, settings: { ...settings, hooks } };
}

/**
 * Install the Stop hook into `settingsPath` (atomic tempfile + rename).
 *
 * @param {{ settingsPath: string, hookCommand: string }} options
 * @returns {{ status: "installed" | "already-installed" | "error", detail?: string }}
 */
export function installStopHook({ settingsPath, hookCommand }) {
	let existing = {};
	if (existsSync(settingsPath)) {
		try {
			const raw = readFileSync(settingsPath, "utf8");
			if (raw.trim().length > 0) existing = JSON.parse(raw);
		} catch (err) {
			return { status: "error", detail: `cannot parse ${settingsPath}: ${err.message}` };
		}
		if (existing === null || typeof existing !== "object" || Array.isArray(existing)) {
			return { status: "error", detail: `${settingsPath} is not a JSON object — left untouched` };
		}
	}

	const { changed, settings } = mergeStopHook(existing, hookCommand);
	if (!changed) return { status: "already-installed" };

	mkdirSync(dirname(settingsPath), { recursive: true });
	const tmp = `${settingsPath}.pigeon.tmp`;
	writeFileSync(tmp, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
	renameSync(tmp, settingsPath);
	return { status: "installed" };
}
