// @vitest-environment node
/**
 * Tests for `buildAttributionSnapshot` (#269 + #272).
 *
 * Hand-built duck-typed prisma mock — no DB fixture needed since the
 * builder is at most three Prisma calls plus mapping. The token-usage
 * integration tests
 * (`server/services/__tests__/token-usage-attribution.test.ts`) cover
 * the end-to-end behavior against a real SQLite fixture, including the
 * `column.role = "active"` join.
 */

import { describe, expect, it, vi } from "vitest";
import { buildAttributionSnapshot } from "@/lib/services/attribution-snapshot";

type ActivityRow = { cardId: string; createdAt: Date };
type GitLinkRow = { cardId: string; commitDate: Date };

function makePrisma(opts: {
	cardRows?: { id: string }[];
	activityRows?: ActivityRow[];
	gitLinkRows?: GitLinkRow[];
}) {
	const cardFindMany = vi.fn(async () => opts.cardRows ?? []);
	const activityFindMany = vi.fn(async () => opts.activityRows ?? []);
	const gitLinkFindMany = vi.fn(async () => opts.gitLinkRows ?? []);
	return {
		mock: { cardFindMany, activityFindMany, gitLinkFindMany },
		// biome-ignore lint/suspicious/noExplicitAny: duck-typed prisma surface for tests
		prisma: {
			card: { findMany: cardFindMany },
			activity: { findMany: activityFindMany },
			gitLink: { findMany: gitLinkFindMany },
		} as any,
	};
}

describe("buildAttributionSnapshot — base scope (#269)", () => {
	it("populates inProgressCardIds from cards in active-role columns for the project", async () => {
		const { prisma, mock } = makePrisma({ cardRows: [{ id: "card-a" }, { id: "card-b" }] });
		const snapshot = await buildAttributionSnapshot(prisma, "proj-1");

		expect(snapshot.inProgressCardIds).toEqual(["card-a", "card-b"]);
		expect(mock.cardFindMany).toHaveBeenCalledWith({
			where: { projectId: "proj-1", column: { role: "active" } },
			select: { id: true },
		});
	});

	it("returns empty inProgressCardIds when no cards are active", async () => {
		const { prisma } = makePrisma({});
		const snapshot = await buildAttributionSnapshot(prisma, "proj-1");
		expect(snapshot.inProgressCardIds).toEqual([]);
	});

	it("leaves sessionTouchedCards + sessionCommits empty when no mcpSessionId is supplied", async () => {
		// Web-side fallback: with no MCP session concept, signals 3 + 4 must
		// stay empty so `attribute()` never returns a wrong card from
		// session-scoped data the caller never tagged.
		const { prisma, mock } = makePrisma({ cardRows: [{ id: "card-a" }] });
		const snapshot = await buildAttributionSnapshot(prisma, "proj-1");
		expect(snapshot.sessionTouchedCards).toEqual([]);
		expect(snapshot.sessionCommits).toEqual([]);
		expect(mock.activityFindMany).not.toHaveBeenCalled();
		expect(mock.gitLinkFindMany).not.toHaveBeenCalled();
	});

	it("leaves sessionTouchedCards + sessionCommits empty when sessionAnchor is missing", async () => {
		// Defensive: passing mcpSessionId without an anchor would otherwise
		// fall back to `createdAt > undefined`, which Prisma would reject.
		// The builder gates the queries on both being non-null.
		const { prisma, mock } = makePrisma({});
		const snapshot = await buildAttributionSnapshot(prisma, "proj-1", {
			mcpSessionId: "mcp-sess-1",
			sessionAnchor: null,
		});
		expect(snapshot.sessionTouchedCards).toEqual([]);
		expect(snapshot.sessionCommits).toEqual([]);
		expect(mock.activityFindMany).not.toHaveBeenCalled();
		expect(mock.gitLinkFindMany).not.toHaveBeenCalled();
	});
});

describe("buildAttributionSnapshot — session-scoped (#272)", () => {
	it("queries Activity scoped by sessionId + createdAt + project", async () => {
		const anchor = new Date("2026-05-06T10:00:00Z");
		const touchedAt = new Date("2026-05-06T10:30:00Z");
		const { prisma, mock } = makePrisma({
			cardRows: [],
			activityRows: [{ cardId: "card-touched", createdAt: touchedAt }],
		});
		const snapshot = await buildAttributionSnapshot(prisma, "proj-1", {
			mcpSessionId: "mcp-sess-1",
			sessionAnchor: anchor,
		});

		expect(snapshot.sessionTouchedCards).toEqual([{ cardId: "card-touched", touchedAt }]);
		expect(mock.activityFindMany).toHaveBeenCalledWith({
			where: {
				sessionId: "mcp-sess-1",
				createdAt: { gt: anchor },
				card: { projectId: "proj-1" },
			},
			select: { cardId: true, createdAt: true },
		});
	});

	it("queries GitLink scoped by sessionId + commitDate + projectId", async () => {
		const anchor = new Date("2026-05-06T10:00:00Z");
		const commitDate = new Date("2026-05-06T10:45:00Z");
		const { prisma, mock } = makePrisma({
			gitLinkRows: [{ cardId: "card-shipped", commitDate }],
		});
		const snapshot = await buildAttributionSnapshot(prisma, "proj-1", {
			mcpSessionId: "mcp-sess-1",
			sessionAnchor: anchor,
		});

		expect(snapshot.sessionCommits).toEqual([{ cardId: "card-shipped", commitDate }]);
		expect(mock.gitLinkFindMany).toHaveBeenCalledWith({
			where: {
				projectId: "proj-1",
				sessionId: "mcp-sess-1",
				commitDate: { gt: anchor },
			},
			select: { cardId: true, commitDate: true },
		});
	});

	it("populates all three signal sources together when both session inputs are set", async () => {
		const anchor = new Date("2026-05-06T10:00:00Z");
		const { prisma } = makePrisma({
			cardRows: [{ id: "card-active" }],
			activityRows: [{ cardId: "card-touched", createdAt: new Date("2026-05-06T10:15:00Z") }],
			gitLinkRows: [{ cardId: "card-shipped", commitDate: new Date("2026-05-06T10:45:00Z") }],
		});
		const snapshot = await buildAttributionSnapshot(prisma, "proj-1", {
			mcpSessionId: "mcp-sess-1",
			sessionAnchor: anchor,
		});

		expect(snapshot.inProgressCardIds).toEqual(["card-active"]);
		expect(snapshot.sessionTouchedCards.map((t) => t.cardId)).toEqual(["card-touched"]);
		expect(snapshot.sessionCommits.map((c) => c.cardId)).toEqual(["card-shipped"]);
	});
});
