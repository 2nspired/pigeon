// Tests for the card-context comment window (#301).
//
// Card-context queries fetch comments `createdAt: "desc"` + `take: 50` so the
// cap keeps the NEWEST comments, then windowRecentComments reverses the slice
// back to chronological order and flags truncation. Before #301 the fetch was
// `asc` + `take: 50`, which silently dropped the newest comments on cards with
// more than 50 — exactly the ones agents need.
import { describe, expect, it } from "vitest";
import { CARD_CONTEXT_COMMENT_LIMIT, windowRecentComments } from "@/mcp/tools/context-tools";

/** Build n comments at known 1-minute-apart timestamps, oldest first. */
function makeComments(n: number) {
	const base = new Date("2026-07-01T00:00:00Z").getTime();
	return Array.from({ length: n }, (_, i) => ({
		content: `comment ${i + 1}`,
		createdAt: new Date(base + i * 60_000),
	}));
}

/** Simulate the Prisma fetch: newest-first, capped at `limit`. */
function fetchNewestFirst<T extends { createdAt: Date }>(all: T[], limit: number): T[] {
	return [...all].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}

describe("windowRecentComments", () => {
	it("returns the latest 50 in chronological order and flags truncation on a 60-comment card", () => {
		const all = makeComments(60);
		const fetched = fetchNewestFirst(all, CARD_CONTEXT_COMMENT_LIMIT);

		const { comments, truncated } = windowRecentComments(fetched, all.length);

		expect(truncated).toBe(true);
		expect(comments).toHaveLength(CARD_CONTEXT_COMMENT_LIMIT);
		// The newest 50 survive the cap: comments 11..60, oldest→newest.
		expect(comments[0]?.content).toBe("comment 11");
		expect(comments[comments.length - 1]?.content).toBe("comment 60");
		for (let i = 1; i < comments.length; i++) {
			expect(comments[i]!.createdAt.getTime()).toBeGreaterThan(
				comments[i - 1]!.createdAt.getTime()
			);
		}
	});

	it("returns all comments unchanged with no truncation marker on a card under the cap", () => {
		const all = makeComments(3);
		const fetched = fetchNewestFirst(all, CARD_CONTEXT_COMMENT_LIMIT);

		const { comments, truncated } = windowRecentComments(fetched, all.length);

		expect(truncated).toBe(false);
		expect(comments.map((c) => c.content)).toEqual(["comment 1", "comment 2", "comment 3"]);
	});

	it("does not flag truncation at exactly the cap", () => {
		const all = makeComments(CARD_CONTEXT_COMMENT_LIMIT);
		const fetched = fetchNewestFirst(all, CARD_CONTEXT_COMMENT_LIMIT);

		const { comments, truncated } = windowRecentComments(fetched, all.length);

		expect(truncated).toBe(false);
		expect(comments).toHaveLength(CARD_CONTEXT_COMMENT_LIMIT);
		expect(comments[0]?.content).toBe("comment 1");
	});

	it("does not mutate the input array", () => {
		const fetched = fetchNewestFirst(makeComments(5), CARD_CONTEXT_COMMENT_LIMIT);
		const snapshot = [...fetched];

		windowRecentComments(fetched, 5);

		expect(fetched).toEqual(snapshot);
	});

	it("handles an empty comment list", () => {
		const { comments, truncated } = windowRecentComments([], 0);
		expect(comments).toEqual([]);
		expect(truncated).toBe(false);
	});
});
