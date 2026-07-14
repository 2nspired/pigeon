/**
 * MCP surface hygiene (#317).
 *
 * Locks in the three D2 fixes: the old 13-tool `context` grab-bag is split
 * into knowledge / context / digest; legacy aliases carry a structured
 * `deprecated` annotation surfaced through getTools; and planCard is an
 * essential tool (with a redirect hint when called via runTool).
 */

import { describe, expect, it } from "vitest";

// Populate the registry — same side-effect import the server and the
// catalog/docs sync scripts use.
import "../register-all-tools";

import { ESSENTIAL_TOOLS } from "../manifest";
import { executeTool, getAllExtendedTools, getToolCatalog } from "../tool-registry";

function toolsInCategory(category: string): string[] {
	const result = getToolCatalog({ category });
	if (result?.type !== "tools") throw new Error(`no tools for category ${category}`);
	return result.tools.map((t) => t.name).sort();
}

describe("context grab-bag split (#317)", () => {
	it("context keeps only the deep-context bundles", () => {
		expect(toolsInCategory("context")).toEqual([
			"getCardContext",
			"getMilestoneContext",
			"getTagContext",
		]);
	});

	it("knowledge owns claims, legacy facts, and the FTS index", () => {
		expect(toolsInCategory("knowledge")).toEqual([
			"listClaims",
			"listFacts",
			"queryKnowledge",
			"rebuildKnowledgeIndex",
			"saveClaim",
			"saveFact",
		]);
	});

	it("digest owns the Daily Squawk tools", () => {
		expect(toolsInCategory("digest")).toEqual(["getActivityWindow", "publishEdition", "squawk"]);
	});

	it("the categories overview lists knowledge and digest with descriptions", () => {
		const overview = getToolCatalog();
		if (overview?.type !== "categories") throw new Error("expected categories overview");
		const names = overview.categories.map((c) => c.name);
		expect(names).toContain("knowledge");
		expect(names).toContain("digest");
		expect(names).toContain("context");
		for (const cat of overview.categories) {
			if (["knowledge", "digest", "context"].includes(cat.name)) {
				expect(cat.description).not.toBe("");
			}
		}
	});
});

describe("structured deprecated annotation (#317)", () => {
	const EXPECTED: Record<string, string> = {
		recordDecision: "saveClaim",
		getDecisions: "listClaims",
		updateDecision: "saveClaim",
		saveFact: "saveClaim",
		listFacts: "listClaims",
	};

	it.each(
		Object.entries(EXPECTED)
	)("%s carries deprecated.replacement=%s in getTools detail", (name, replacement) => {
		const detail = getToolCatalog({ tool: name });
		if (detail?.type !== "detail") throw new Error(`no detail for ${name}`);
		expect(detail.tool.deprecated?.replacement).toBe(replacement);
		expect(detail.tool.deprecated?.reason).toBeTruthy();
	});

	it("surfaces deprecated in category tool summaries", () => {
		const decisions = getToolCatalog({ category: "decisions" });
		if (decisions?.type !== "tools") throw new Error("expected tools");
		for (const t of decisions.tools) {
			expect(t.deprecated?.replacement).toBeTruthy();
		}

		const knowledge = getToolCatalog({ category: "knowledge" });
		if (knowledge?.type !== "tools") throw new Error("expected tools");
		const byName = new Map(knowledge.tools.map((t) => [t.name, t]));
		expect(byName.get("saveFact")?.deprecated?.replacement).toBe("saveClaim");
		expect(byName.get("listFacts")?.deprecated?.replacement).toBe("listClaims");
		// The canonical tools are NOT deprecated.
		expect(byName.get("saveClaim")?.deprecated).toBeUndefined();
		expect(byName.get("listClaims")?.deprecated).toBeUndefined();
	});

	it("surfaces deprecated in getAllExtendedTools (manifest/catalog path)", () => {
		const all = getAllExtendedTools();
		const deprecatedNames = all.filter((t) => t.deprecated).map((t) => t.name);
		expect(deprecatedNames.sort()).toEqual(Object.keys(EXPECTED).sort());
	});
});

describe("planCard promotion (#317)", () => {
	it("planCard is an essential tool", () => {
		expect(ESSENTIAL_TOOLS.map((t) => t.name)).toContain("planCard");
	});

	it("planCard is no longer in the extended registry", () => {
		expect(getAllExtendedTools().map((t) => t.name)).not.toContain("planCard");
		expect(getToolCatalog({ tool: "planCard" })).toBeNull();
	});

	it("runTool('planCard') returns a direct-call redirect, not a dead end", async () => {
		const result = await executeTool("planCard", {});
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("essential tool");
		expect(result.content[0]?.text).toContain("planCard");
		expect(result.content[0]?.text).not.toContain("not found");
	});

	it("a genuinely unknown tool still gets the not-found hint", async () => {
		const result = await executeTool("definitelyNotATool", {});
		expect(result.isError).toBe(true);
		expect(result.content[0]?.text).toContain("not found");
	});
});
