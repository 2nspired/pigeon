"use client";

import { useEffect, useRef, useState } from "react";
import { api } from "@/trpc/react";

const FALLBACK_INTERVAL = 5000;
const MAX_RETRIES = 3;

/**
 * Connects to the SSE endpoint for real-time board updates.
 * Invalidates board-scoped queries when events arrive.
 * Returns a fallback refetchInterval (5s) when SSE is unavailable.
 */
export function useBoardEvents(boardId: string): number | undefined {
	const utils = api.useUtils();
	const [connected, setConnected] = useState(false);
	const failCount = useRef(0);

	useEffect(() => {
		const es = new EventSource(`/api/events?boardId=${boardId}`);

		es.onopen = () => {
			setConnected(true);
			failCount.current = 0;
		};

		es.onmessage = (event) => {
			try {
				const data = JSON.parse(event.data);
				if (data.type === "connected") return;

				// Invalidate all board-scoped queries on any event
				void utils.board.getFull.invalidate({ id: boardId });
				void utils.handoff.list.invalidate({ boardId });
				void utils.activity.listByBoard.invalidate({ boardId });
			} catch {
				// Ignore parse errors
			}
		};

		es.onerror = () => {
			failCount.current++;
			if (failCount.current >= MAX_RETRIES) {
				setConnected(false);
				es.close();
			}
		};

		return () => es.close();
	}, [boardId, utils]);

	return connected ? undefined : FALLBACK_INTERVAL;
}
