import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db } from "./db.js";

const execFileAsync = promisify(execFile);

const EXEC_OPTS = { timeout: 5000, maxBuffer: 1024 * 1024 };

// ─── Age thresholds (days) ─────────────────────────────────────────

const AGENT_POSSIBLY_STALE_DAYS = 14;
const AGENT_STALE_DAYS = 30;
const HUMAN_POSSIBLY_STALE_DAYS = 30;
const HUMAN_STALE_DAYS = 60;

// ─── Types ─────────────────────────────────────────────────────────

export type StalenessWarning = {
	entryId: string;
	claim: string;
	reason: string;
	type: "file-changed" | "age-decay";
	severity: "stale" | "possibly-stale";
};

// ─── Core ──────────────────────────────────────────────────────────

export async function checkStaleness(projectId: string): Promise<StalenessWarning[]> {
	const entries = await db.persistentContextEntry.findMany({
		where: { projectId },
	});

	if (entries.length === 0) return [];

	const project = await db.project.findUnique({
		where: { id: projectId },
		select: { repoPath: true },
	});

	const warnings: StalenessWarning[] = [];
	const now = Date.now();

	for (const entry of entries) {
		const citedFiles = JSON.parse(entry.citedFiles) as string[];

		if (citedFiles.length > 0 && entry.recordedAtSha) {
			// File-cited staleness (Bazel-style SHA comparison)
			if (!project?.repoPath) continue;

			const fileWarning = await checkFileCitedStaleness(
				entry.id,
				entry.claim,
				citedFiles,
				entry.recordedAtSha,
				project.repoPath,
			);
			if (fileWarning) {
				warnings.push(fileWarning);
			}
		} else {
			// Narrative staleness (age-based)
			const ageDays = Math.floor((now - entry.createdAt.getTime()) / (1000 * 60 * 60 * 24));
			const isAgent = entry.author === "AGENT";

			const staleDays = isAgent ? AGENT_STALE_DAYS : HUMAN_STALE_DAYS;
			const possiblyStaleDays = isAgent ? AGENT_POSSIBLY_STALE_DAYS : HUMAN_POSSIBLY_STALE_DAYS;

			if (ageDays >= staleDays) {
				warnings.push({
					entryId: entry.id,
					claim: entry.claim,
					reason: isAgent
						? `Agent-recorded fact, ${ageDays} days old without review`
						: `Human-recorded fact, ${ageDays} days old`,
					type: "age-decay",
					severity: "stale",
				});
			} else if (ageDays >= possiblyStaleDays) {
				warnings.push({
					entryId: entry.id,
					claim: entry.claim,
					reason: isAgent
						? `Agent-recorded fact, ${ageDays} days old without review`
						: `Human-recorded fact, ${ageDays} days old`,
					type: "age-decay",
					severity: "possibly-stale",
				});
			}
		}
	}

	return warnings;
}

async function checkFileCitedStaleness(
	entryId: string,
	claim: string,
	citedFiles: string[],
	recordedAtSha: string,
	repoPath: string,
): Promise<StalenessWarning | null> {
	for (const filePath of citedFiles) {
		try {
			const { stdout } = await execFileAsync(
				"git",
				["log", "-1", "--format=%H", "--", filePath],
				{ ...EXEC_OPTS, cwd: repoPath },
			);

			const latestSha = stdout.trim();
			if (!latestSha) continue;

			if (latestSha !== recordedAtSha) {
				return {
					entryId,
					claim,
					reason: `Cited file \`${filePath}\` changed since this was recorded (recorded at ${recordedAtSha.slice(0, 7)}, now at ${latestSha.slice(0, 7)})`,
					type: "file-changed",
					severity: "stale",
				};
			}
		} catch {
			// Git operation failed — skip this file, don't fail the whole check
			continue;
		}
	}

	return null;
}

// ─── Formatting ────────────────────────────────────────────────────

export function formatStalenessWarnings(warnings: StalenessWarning[]): string | null {
	if (warnings.length === 0) return null;

	const lines = warnings.map((w) =>
		`- **[${w.severity}]** "${w.claim}" — ${w.reason}`
	);

	return [
		"\u26a0\ufe0f STALE CONTEXT WARNINGS",
		"The following persistent context entries may be outdated:",
		"",
		...lines,
		"",
		"Use `listContextEntries` to review, `saveContextEntry` with entryId to update, or `deleteContextEntry` to remove stale entries.",
	].join("\n");
}
