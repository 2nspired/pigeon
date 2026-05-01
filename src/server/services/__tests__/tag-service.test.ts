import { describe, expect, it } from "vitest";
import { __testing__ } from "@/server/services/tag-service";

const { computeGovernanceHints, validateMergeGuards } = __testing__;

const tag = (
	overrides: Partial<{ id: string; slug: string; label: string; usageCount: number }>
) => ({
	id: overrides.id ?? "id-default",
	slug: overrides.slug ?? "default-slug",
	label: overrides.label ?? "Default",
	usageCount: overrides.usageCount ?? 0,
});

describe("computeGovernanceHints", () => {
	it("returns undefined when no signals fire (usage > 1, no near-miss peers)", () => {
		const subject = tag({ id: "a", slug: "feature", usageCount: 5 });
		const peers = [
			subject,
			tag({ id: "b", slug: "infrastructure", usageCount: 3 }),
			tag({ id: "c", slug: "documentation", usageCount: 2 }),
		];
		expect(computeGovernanceHints(subject, peers)).toBeUndefined();
	});

	it("returns singleton: true when usageCount === 1", () => {
		const subject = tag({ id: "a", slug: "release-prep", usageCount: 1 });
		const result = computeGovernanceHints(subject, [subject]);
		expect(result).toEqual({ singleton: true });
	});

	it("does not flag singleton when usageCount === 0 (orphan, not single-use)", () => {
		const subject = tag({ id: "a", slug: "abandoned", usageCount: 0 });
		const result = computeGovernanceHints(subject, [subject]);
		expect(result).toBeUndefined();
	});

	it("does not flag singleton when usageCount > 1", () => {
		const subject = tag({ id: "a", slug: "well-used", usageCount: 4 });
		const result = computeGovernanceHints(subject, [subject]);
		expect(result).toBeUndefined();
	});

	it("returns possibleMerge for peers within Levenshtein ≤ 2", () => {
		const subject = tag({ id: "a", slug: "release", label: "Release", usageCount: 3 });
		const peers = [
			subject,
			tag({ id: "b", slug: "releas", label: "Releas", usageCount: 1 }), // distance 1
			tag({ id: "c", slug: "release-prep", label: "Release Prep", usageCount: 2 }), // distance 5 — out
			tag({ id: "d", slug: "relase", label: "Relase", usageCount: 1 }), // distance 1 (transposition)
		];
		const result = computeGovernanceHints(subject, peers);
		expect(result?.possibleMerge).toBeDefined();
		const ids = result?.possibleMerge?.map((p) => p.id) ?? [];
		expect(ids).toContain("b");
		expect(ids).toContain("d");
		expect(ids).not.toContain("c");
	});

	it("excludes the subject itself from possibleMerge", () => {
		const subject = tag({ id: "a", slug: "feature", usageCount: 3 });
		const peers = [subject, tag({ id: "b", slug: "feature", usageCount: 2 })];
		// Same slug means subject + peer-b have distance 0 — peer-b should
		// be flagged but subject must not flag itself.
		const result = computeGovernanceHints(subject, peers);
		const ids = result?.possibleMerge?.map((p) => p.id) ?? [];
		expect(ids).toEqual(["b"]);
	});

	it("skips peers with empty slugs", () => {
		const subject = tag({ id: "a", slug: "ui", usageCount: 3 });
		const peers = [
			subject,
			tag({ id: "b", slug: "", label: "(blank)", usageCount: 1 }),
			tag({ id: "c", slug: "ux", usageCount: 2 }), // distance 1
		];
		const result = computeGovernanceHints(subject, peers);
		const ids = result?.possibleMerge?.map((p) => p.id) ?? [];
		expect(ids).toEqual(["c"]);
	});

	it("does not compute possibleMerge for a subject with empty slug", () => {
		const subject = tag({ id: "a", slug: "", usageCount: 3 });
		const peers = [subject, tag({ id: "b", slug: "anything", usageCount: 5 })];
		const result = computeGovernanceHints(subject, peers);
		expect(result).toBeUndefined();
	});

	it("sorts possibleMerge ascending by distance", () => {
		const subject = tag({ id: "a", slug: "deploy", usageCount: 3 });
		const peers = [
			subject,
			tag({ id: "b", slug: "deplo", usageCount: 1 }), // distance 1
			tag({ id: "c", slug: "deploys", usageCount: 1 }), // distance 1
			tag({ id: "d", slug: "deplyo", usageCount: 1 }), // distance 2
		];
		const result = computeGovernanceHints(subject, peers);
		const distances = result?.possibleMerge?.map((p) => p.distance) ?? [];
		expect(distances).toEqual([...distances].sort((x, y) => x - y));
	});

	it("returns both signals when singleton AND near-miss apply", () => {
		const subject = tag({ id: "a", slug: "ui", usageCount: 1 });
		const peers = [subject, tag({ id: "b", slug: "ux", usageCount: 5 })];
		const result = computeGovernanceHints(subject, peers);
		expect(result?.singleton).toBe(true);
		expect(result?.possibleMerge?.length).toBeGreaterThan(0);
	});
});

describe("validateMergeGuards", () => {
	const active = (id: string, projectId = "p1") => ({ id, projectId, state: "active" });
	const archived = (id: string, projectId = "p1") => ({ id, projectId, state: "archived" });

	it("returns ok when both tags exist, distinct IDs, same project, active source", () => {
		expect(validateMergeGuards(active("from"), active("into"))).toEqual({ ok: true });
	});

	it("returns NOT_FOUND when source is null", () => {
		const result = validateMergeGuards(null, active("into"));
		expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
	});

	it("returns NOT_FOUND when destination is null", () => {
		const result = validateMergeGuards(active("from"), null);
		expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
	});

	it("returns INVALID_INPUT when source and destination are the same id", () => {
		const result = validateMergeGuards(active("same"), active("same"));
		expect(result).toMatchObject({ ok: false, code: "INVALID_INPUT" });
	});

	it("returns CROSS_PROJECT when projects differ", () => {
		const result = validateMergeGuards(active("from", "p1"), active("into", "p2"));
		expect(result).toMatchObject({ ok: false, code: "CROSS_PROJECT" });
	});

	it("returns SOURCE_ARCHIVED when source is archived", () => {
		const result = validateMergeGuards(archived("from"), active("into"));
		expect(result).toMatchObject({ ok: false, code: "SOURCE_ARCHIVED" });
	});

	it("allows merge when destination is archived but source is active", () => {
		// Per plan: only source-archived blocks merge. Destination archived
		// is a permitted (if unusual) operation — the destination tag stays
		// archived, but its CardTag rows pick up the migrated entries.
		const result = validateMergeGuards(active("from"), archived("into"));
		expect(result).toEqual({ ok: true });
	});
});
