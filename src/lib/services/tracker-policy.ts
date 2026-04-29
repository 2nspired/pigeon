/**
 * Reads `tracker.md` from a project's repo root and returns the parsed policy
 * object that briefMe (and later getCardContext, MCP middleware) surface to
 * agents. Implementation card 1/7 of RFC #111 (`docs/RFC-WORKFLOW.md`).
 *
 * Day-one schema: `intent_required_on` + `columns.<name>.prompt` only. Body
 * (everything after the closing front-matter `---`) becomes `policy.prompt`.
 *
 * Read-on-every-call (no cache) — file is small, SQLite is local. That gives
 * the Symphony-style "hot reload" property for free.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { load as parseYaml } from "js-yaml";

export type TrackerPolicy = {
	prompt: string;
	intent_required_on: string[];
	columns: Record<string, { prompt: string }>;
	schema_version: number;
};

export type LoadPolicyResult = {
	policy: TrackerPolicy | null;
	warnings: string[];
};

const FILENAME = "tracker.md";
const FRONT_MATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
const CONFLICT_WARNING =
	"Project has both tracker.md and a non-empty projectPrompt. Using tracker.md. Run `migrateProjectPrompt` or delete the DB value to clear this warning.";

export async function loadTrackerPolicy(input: {
	repoPath: string | null;
	projectPrompt: string | null;
}): Promise<LoadPolicyResult> {
	const { repoPath, projectPrompt } = input;
	if (!repoPath) return { policy: null, warnings: [] };

	let raw: string;
	try {
		raw = await readFile(join(repoPath, FILENAME), "utf8");
	} catch {
		// Treat any read error as "file absent." Card #127 will refine this into
		// ENOENT vs unreadable, with a `policy_error` field for the latter.
		return { policy: null, warnings: [] };
	}

	const match = FRONT_MATTER_RE.exec(raw);
	let frontMatter: Record<string, unknown> = {};
	let body: string;
	if (match) {
		try {
			const parsed = parseYaml(match[1]);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
				frontMatter = parsed as Record<string, unknown>;
			}
		} catch {
			// YAML parse failure degrades to "no policy" until card #127 surfaces
			// `policy_error` in the briefMe response.
			return { policy: null, warnings: [] };
		}
		body = match[2];
	} else {
		body = raw;
	}

	const prompt = body.trim();

	const intentRaw = frontMatter.intent_required_on;
	const intent_required_on = Array.isArray(intentRaw)
		? intentRaw.filter((v): v is string => typeof v === "string")
		: [];

	const columns: Record<string, { prompt: string }> = {};
	const columnsRaw = frontMatter.columns;
	if (columnsRaw && typeof columnsRaw === "object" && !Array.isArray(columnsRaw)) {
		for (const [name, value] of Object.entries(columnsRaw as Record<string, unknown>)) {
			if (value && typeof value === "object" && !Array.isArray(value)) {
				const p = (value as { prompt?: unknown }).prompt;
				if (typeof p === "string") columns[name] = { prompt: p };
			}
		}
	}

	const schemaVersionRaw = frontMatter.schema_version;
	const schema_version = typeof schemaVersionRaw === "number" ? schemaVersionRaw : 1;

	const policy: TrackerPolicy = {
		prompt,
		intent_required_on,
		columns,
		schema_version,
	};

	const warnings: string[] = [];
	if (prompt.length > 0 && projectPrompt && projectPrompt.trim().length > 0) {
		warnings.push(CONFLICT_WARNING);
	}

	return { policy, warnings };
}
