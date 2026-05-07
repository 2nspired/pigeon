// @vitest-environment node
/**
 * Tests for `parseIssue` — the pure markdown splitter that backs the
 * `/squawk/[editionId]` reader (#298).
 *
 * The renderer trusts the agent's markdown to follow the section
 * protocol (level-2 heading + italic byline). These tests pin the
 * splitter against the four shapes the reader has to handle:
 *   - Standard issue with all 11 sections
 *   - Missing byline on a section
 *   - Crossword fenced block stripped from sections, returned separately
 *   - Empty / malformed input
 */

import { describe, expect, it } from "vitest";

import { parseIssue } from "@/components/squawk/section-renderer";

describe("parseIssue", () => {
	it("splits a multi-section issue and classifies by byline", () => {
		const md = [
			"## Today's Front Page",
			"*By Edith Featherstone*",
			"",
			"A quiet morning over the rooftops.",
			"",
			"## The Roost Report",
			"*By Reginald Plumage III*",
			"",
			"Five cards shipped.",
			"",
			"## The Blocker Beat",
			"*By Marge Pebble*",
			"",
			"Nothing to report.",
		].join("\n");

		const { sections } = parseIssue(md);
		expect(sections).toHaveLength(3);
		expect(sections[0].kind).toBe("front-page");
		expect(sections[0].byline).toBe("Edith Featherstone");
		expect(sections[1].kind).toBe("roost-report");
		expect(sections[2].kind).toBe("blocker-beat");
	});

	it("strips the byline line from the body", () => {
		const md = "## The Pigeon Post\n*By Coo-Coo Carmichael*\n\nA letter follows.";
		const { sections } = parseIssue(md);
		expect(sections[0].body).toBe("A letter follows.");
		expect(sections[0].kind).toBe("pigeon-post");
	});

	it("disambiguates Coo-Coo Carmichael's two columns by title", () => {
		const md = [
			"## Letters to the Editor",
			"*By Coo-Coo Carmichael*",
			"",
			"Inbox quiet.",
			"",
			"## The Pigeon Post",
			"*By Coo-Coo Carmichael*",
			"",
			"A note from the editor.",
		].join("\n");
		const { sections } = parseIssue(md);
		expect(sections[0].kind).toBe("letters");
		expect(sections[1].kind).toBe("pigeon-post");
	});

	it("classifies missing-byline sections as 'unknown'", () => {
		const md = "## Mystery Column\n\nNo byline here.";
		const { sections } = parseIssue(md);
		expect(sections).toHaveLength(1);
		expect(sections[0].byline).toBeNull();
		expect(sections[0].kind).toBe("unknown");
	});

	it("extracts the crossword block and removes it from the body", () => {
		const md = [
			"## Today's Front Page",
			"*By Edith Featherstone*",
			"",
			"Lede.",
			"",
			"```crossword",
			"1. ACROSS — Pigeon",
			"2. DOWN  — Coop",
			"```",
		].join("\n");

		const { sections, crossword } = parseIssue(md);
		expect(crossword).toContain("ACROSS");
		expect(crossword).toContain("DOWN");
		// The body should not still contain the crossword fence.
		const merged = sections.map((s) => s.body).join("\n");
		expect(merged).not.toContain("```crossword");
	});

	it("returns empty sections + null crossword on empty input", () => {
		const { sections, crossword } = parseIssue("");
		expect(sections).toHaveLength(0);
		expect(crossword).toBeNull();
	});

	it("classifies the corrections section by title even when bylined Edith", () => {
		const md = "## Corrections & Amplifications\n*By Edith Featherstone*\n\nWe regret the error.";
		const { sections } = parseIssue(md);
		expect(sections[0].kind).toBe("corrections");
	});
});
