"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { api } from "@/trpc/react";

const BANNER_LIFETIME_MS = 10_000;

type BannerInfo = {
	activityId: string;
	actorType: "AGENT" | "HUMAN";
	actorName: string | null;
	intent: string;
	expiresAt: number;
};

type IntentBannerContextValue = {
	getBanner: (cardId: string) => BannerInfo | undefined;
	dismiss: (cardId: string) => void;
};

const IntentBannerContext = createContext<IntentBannerContextValue | null>(null);

export function IntentBannerProvider({
	boardId,
	children,
}: {
	boardId: string;
	children: React.ReactNode;
}) {
	const { data: activities } = api.activity.listByBoard.useQuery({ boardId });
	const seenIdsRef = useRef<Set<string>>(new Set());
	const initializedRef = useRef(false);
	const [banners, setBanners] = useState<Map<string, BannerInfo>>(new Map());

	useEffect(() => {
		if (!activities) return;

		// On first load, mark everything seen so stale activities don't flash banners.
		if (!initializedRef.current) {
			for (const a of activities) seenIdsRef.current.add(a.id);
			initializedRef.current = true;
			return;
		}

		const next: Array<BannerInfo & { cardId: string }> = [];
		for (const a of activities) {
			if (seenIdsRef.current.has(a.id)) continue;
			seenIdsRef.current.add(a.id);
			if (!a.intent) continue;
			next.push({
				cardId: a.card.id,
				activityId: a.id,
				actorType: a.actorType as "AGENT" | "HUMAN",
				actorName: a.actorName ?? null,
				intent: a.intent,
				expiresAt: Date.now() + BANNER_LIFETIME_MS,
			});
		}
		if (next.length === 0) return;

		setBanners((prev) => {
			const copy = new Map(prev);
			for (const b of next) {
				const { cardId, ...info } = b;
				copy.set(cardId, info);
			}
			return copy;
		});
	}, [activities]);

	// Sweep expired banners every second.
	useEffect(() => {
		if (banners.size === 0) return;
		const interval = window.setInterval(() => {
			const now = Date.now();
			setBanners((prev) => {
				let changed = false;
				const copy = new Map(prev);
				for (const [cardId, info] of copy) {
					if (info.expiresAt <= now) {
						copy.delete(cardId);
						changed = true;
					}
				}
				return changed ? copy : prev;
			});
		}, 1000);
		return () => window.clearInterval(interval);
	}, [banners.size]);

	const getBanner = useCallback((cardId: string) => banners.get(cardId), [banners]);

	const dismiss = useCallback((cardId: string) => {
		setBanners((prev) => {
			if (!prev.has(cardId)) return prev;
			const copy = new Map(prev);
			copy.delete(cardId);
			return copy;
		});
	}, []);

	return (
		<IntentBannerContext.Provider value={{ getBanner, dismiss }}>
			{children}
		</IntentBannerContext.Provider>
	);
}

export function useIntentBanner(cardId: string) {
	const ctx = useContext(IntentBannerContext);
	if (!ctx) return { banner: undefined, dismiss: () => {} };
	return { banner: ctx.getBanner(cardId), dismiss: () => ctx.dismiss(cardId) };
}
