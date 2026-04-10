/**
 * SSE endpoint for real-time board updates.
 * Streams change events to connected clients, scoped by boardId.
 *
 * MCP change detector runs as a background interval (~2s) to detect
 * writes from the MCP server process (separate from Next.js).
 */

import { type BoardEvent, emitBoardEvent, eventBus } from "@/lib/events";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// ── MCP Change Detector ─────────────────────────────────────────────

let detectorStarted = false;
let lastActivityTime = 0;

function ensureChangeDetector() {
	if (detectorStarted) return;
	detectorStarted = true;

	// Initialize with current latest activity timestamp
	db.activity
		.findFirst({
			orderBy: { createdAt: "desc" },
			select: { createdAt: true },
		})
		.then((a) => {
			lastActivityTime = a?.createdAt.getTime() ?? Date.now();
		})
		.catch(() => {
			lastActivityTime = Date.now();
		});

	setInterval(async () => {
		try {
			const latest = await db.activity.findFirst({
				orderBy: { createdAt: "desc" },
				select: {
					createdAt: true,
					card: { select: { column: { select: { boardId: true } } } },
				},
			});

			if (latest && latest.createdAt.getTime() > lastActivityTime) {
				lastActivityTime = latest.createdAt.getTime();
				emitBoardEvent(latest.card.column.boardId, "activity:new");
			}
		} catch {
			// Best-effort — detector errors are non-fatal
		}
	}, 2000);
}

// ── SSE Route Handler ───────────────────────────────────────────────

export async function GET(request: Request) {
	const boardId = new URL(request.url).searchParams.get("boardId");
	if (!boardId) {
		return new Response("Missing boardId parameter", { status: 400 });
	}

	ensureChangeDetector();

	const encoder = new TextEncoder();

	const stream = new ReadableStream({
		start(controller) {
			const send = (data: string) => {
				try {
					controller.enqueue(encoder.encode(`data: ${data}\n\n`));
				} catch {
					// Stream closed
				}
			};

			// Initial connection confirmation
			send(JSON.stringify({ type: "connected", boardId }));

			// Forward matching board events to this client
			const handler = (event: BoardEvent) => {
				if (event.boardId === boardId) {
					send(JSON.stringify(event));
				}
			};
			eventBus.on("board-event", handler);

			// Keep-alive ping every 30s
			const ping = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(": ping\n\n"));
				} catch {
					clearInterval(ping);
				}
			}, 30_000);

			// Cleanup when client disconnects
			request.signal.addEventListener("abort", () => {
				eventBus.off("board-event", handler);
				clearInterval(ping);
				try {
					controller.close();
				} catch {
					// Already closed
				}
			});
		},
	});

	return new Response(stream, {
		headers: {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache, no-transform",
			Connection: "keep-alive",
		},
	});
}
