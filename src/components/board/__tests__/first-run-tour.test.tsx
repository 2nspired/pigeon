/**
 * First-run tour rendering (#316) — arming, per-beat dismissal, dismiss-all,
 * persistence across mounts, and the inert no-provider fallback. Pure logic
 * (window predicate, plan detection, storage) is covered in
 * `src/lib/__tests__/first-run-tour.test.ts`.
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { FirstRunTourProvider, TourCoachMark } from "@/components/board/first-run-tour";
import { loadDismissedBeats, TOUR_BEATS } from "@/lib/first-run-tour";

const BOARD_ID = "board-tour-test";
const DAY_MS = 24 * 60 * 60 * 1000;
const freshBoard = () => new Date(Date.now() - 2 * DAY_MS);
const oldBoard = () => new Date(Date.now() - 60 * DAY_MS);

function renderTour(boardCreatedAt: Date, beats: React.ReactNode) {
	return render(
		<FirstRunTourProvider boardId={BOARD_ID} boardCreatedAt={boardCreatedAt}>
			{beats}
		</FirstRunTourProvider>
	);
}

beforeEach(() => {
	window.localStorage.clear();
});

describe("FirstRunTour", () => {
	it("renders a beat with its copy and step counter on a fresh board", () => {
		renderTour(freshBoard(), <TourCoachMark beat="cost" />);

		expect(screen.getByText(TOUR_BEATS.cost.title)).toBeDefined();
		expect(screen.getByText(TOUR_BEATS.cost.body)).toBeDefined();
		expect(screen.getByText(/3 of 3/)).toBeDefined();
	});

	it("does not arm outside the first-run window", () => {
		renderTour(oldBoard(), <TourCoachMark beat="cost" />);
		expect(screen.queryByRole("note")).toBeNull();
	});

	it("renders nothing without a provider (inert fallback)", () => {
		render(<TourCoachMark beat="cost" />);
		expect(screen.queryByRole("note")).toBeNull();
	});

	it("Got it dismisses only that beat and persists it", () => {
		renderTour(
			freshBoard(),
			<>
				<TourCoachMark beat="agent-plan" />
				<TourCoachMark beat="cost" />
			</>
		);

		expect(screen.getAllByRole("note")).toHaveLength(2);

		// Dismiss the agent-plan beat via its "Got it".
		const planBeat = screen
			.getAllByRole("note")
			.find((el) => el.getAttribute("data-tour-beat") === "agent-plan");
		if (!planBeat) throw new Error("agent-plan beat not rendered");
		fireEvent.click(within(planBeat).getByRole("button", { name: "Got it" }));

		const remaining = screen.getAllByRole("note");
		expect(remaining).toHaveLength(1);
		expect(remaining[0]?.getAttribute("data-tour-beat")).toBe("cost");
		expect(loadDismissedBeats(BOARD_ID)).toEqual(["agent-plan"]);
	});

	it("a dismissed beat is never seen again on remount", () => {
		const { unmount } = renderTour(freshBoard(), <TourCoachMark beat="comment-loop" />);
		fireEvent.click(screen.getByRole("button", { name: "Got it" }));
		unmount();

		renderTour(freshBoard(), <TourCoachMark beat="comment-loop" />);
		expect(screen.queryByRole("note")).toBeNull();
	});

	it("Dismiss tour hides every beat at once and persists all of them", () => {
		renderTour(
			freshBoard(),
			<>
				<TourCoachMark beat="agent-plan" />
				<TourCoachMark beat="comment-loop" />
				<TourCoachMark beat="cost" />
			</>
		);
		expect(screen.getAllByRole("note")).toHaveLength(3);

		fireEvent.click(screen.getAllByRole("button", { name: "Dismiss tour" })[0] as HTMLElement);

		expect(screen.queryByRole("note")).toBeNull();
		expect(loadDismissedBeats(BOARD_ID).sort()).toEqual(["agent-plan", "comment-loop", "cost"]);
	});

	it("the X control dismisses the beat", () => {
		renderTour(freshBoard(), <TourCoachMark beat="cost" />);
		fireEvent.click(screen.getByRole("button", { name: "Dismiss this tip" }));
		expect(screen.queryByRole("note")).toBeNull();
		expect(loadDismissedBeats(BOARD_ID)).toEqual(["cost"]);
	});

	it("dismissal is scoped per board", () => {
		const { unmount } = renderTour(freshBoard(), <TourCoachMark beat="cost" />);
		fireEvent.click(screen.getByRole("button", { name: "Got it" }));
		unmount();

		render(
			<FirstRunTourProvider boardId="another-board" boardCreatedAt={freshBoard()}>
				<TourCoachMark beat="cost" />
			</FirstRunTourProvider>
		);
		expect(screen.getByRole("note")).toBeDefined();
	});
});
