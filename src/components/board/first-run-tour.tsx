"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dot } from "@/components/ui/dot";
import {
	ALL_TOUR_BEATS,
	isWithinFirstRunWindow,
	loadDismissedBeats,
	saveDismissedBeats,
	TOUR_BEATS,
	type TourBeatId,
} from "@/lib/first-run-tour";
import { cn } from "@/lib/utils";

/**
 * Human-side first-run tour (#316, v7 spec §5.3) — three dismissible coach
 * marks on a just-seeded board. GitHub/Linear-style: rendered in normal
 * flow (or absolutely positioned next to an anchor), never a modal, never
 * an overlay, never a focus trap. Board interaction is completely
 * unaffected; dismissal is explicit ("Got it" / X per beat, "Dismiss tour"
 * for everything) and permanent per board via localStorage.
 *
 * Anchors:
 *   - `agent-plan`   → above an agent-written plan in the card sheet
 *                      (detected via the locked `## Why now` / `## Plan` headings)
 *   - `comment-loop` → under the comment composer in the card sheet
 *   - `cost`         → floating under the Costs link in the board header
 *
 * Arming lives in `<FirstRunTourProvider>` (board page); logic + copy live
 * in `src/lib/first-run-tour.ts` so they're testable without the DOM.
 */

type FirstRunTourContextValue = {
	/** True once hydrated, inside the first-run window, with beats left. */
	armed: boolean;
	isBeatVisible: (beat: TourBeatId) => boolean;
	dismissBeat: (beat: TourBeatId) => void;
	dismissTour: () => void;
};

const INERT_TOUR: FirstRunTourContextValue = {
	armed: false,
	isBeatVisible: () => false,
	dismissBeat: () => {},
	dismissTour: () => {},
};

const FirstRunTourContext = createContext<FirstRunTourContextValue>(INERT_TOUR);

/** Safe anywhere — resolves to an inert tour outside the provider. */
export function useFirstRunTour(): FirstRunTourContextValue {
	return useContext(FirstRunTourContext);
}

type FirstRunTourProviderProps = {
	boardId: string;
	boardCreatedAt: Date | string;
	children: React.ReactNode;
};

export function FirstRunTourProvider({
	boardId,
	boardCreatedAt,
	children,
}: FirstRunTourProviderProps) {
	// null = not yet hydrated from localStorage — nothing renders until then,
	// so SSR markup and the first client paint agree.
	const [dismissed, setDismissed] = useState<TourBeatId[] | null>(null);

	useEffect(() => {
		setDismissed(loadDismissedBeats(boardId));
	}, [boardId]);

	const withinWindow = useMemo(() => isWithinFirstRunWindow(boardCreatedAt), [boardCreatedAt]);

	const armed = dismissed !== null && withinWindow && dismissed.length < ALL_TOUR_BEATS.length;

	const dismissBeat = useCallback(
		(beat: TourBeatId) => {
			setDismissed((prev) => {
				const next = Array.from(new Set([...(prev ?? []), beat]));
				saveDismissedBeats(boardId, next);
				return next;
			});
		},
		[boardId]
	);

	const dismissTour = useCallback(() => {
		setDismissed(() => {
			const next = [...ALL_TOUR_BEATS];
			saveDismissedBeats(boardId, next);
			return next;
		});
	}, [boardId]);

	const isBeatVisible = useCallback(
		(beat: TourBeatId) => armed && !(dismissed ?? []).includes(beat),
		[armed, dismissed]
	);

	const value = useMemo(
		() => ({ armed, isBeatVisible, dismissBeat, dismissTour }),
		[armed, isBeatVisible, dismissBeat, dismissTour]
	);

	return <FirstRunTourContext.Provider value={value}>{children}</FirstRunTourContext.Provider>;
}

type TourCoachMarkProps = {
	beat: TourBeatId;
	className?: string;
};

/**
 * One tour beat. Renders nothing unless the tour is armed and this beat is
 * undismissed — callers can place it unconditionally next to its anchor.
 * Layout is the caller's job (in-flow by default; pass `absolute …` classes
 * for the floating header variant).
 */
export function TourCoachMark({ beat, className }: TourCoachMarkProps) {
	const { isBeatVisible, dismissBeat, dismissTour } = useFirstRunTour();
	if (!isBeatVisible(beat)) return null;

	const meta = TOUR_BEATS[beat];

	return (
		<aside
			role="note"
			aria-label={`First-run tour, step ${meta.step} of ${ALL_TOUR_BEATS.length}: ${meta.title}`}
			data-tour-beat={beat}
			className={cn(
				"rounded-lg border border-accent-violet/30 bg-popover p-3 text-popover-foreground shadow-md",
				"animate-in fade-in-0 slide-in-from-top-1 duration-slow ease-standard",
				className
			)}
		>
			<div className="flex items-center gap-1.5">
				<Dot tone="agent" size="sm" />
				<span className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
					First-run tour · {meta.step} of {ALL_TOUR_BEATS.length}
				</span>
				<button
					type="button"
					onClick={() => dismissBeat(beat)}
					aria-label="Dismiss this tip"
					className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
				>
					<X className="h-3 w-3" />
				</button>
			</div>
			<p className="mt-1.5 text-sm font-medium">{meta.title}</p>
			<p className="mt-1 text-xs text-muted-foreground">{meta.body}</p>
			<div className="mt-2 flex items-center gap-1">
				<Button variant="outline" size="xs" onClick={() => dismissBeat(beat)}>
					Got it
				</Button>
				<Button variant="ghost" size="xs" className="text-muted-foreground" onClick={dismissTour}>
					Dismiss tour
				</Button>
			</div>
		</aside>
	);
}
