"use client";

import {
	ArrowRightLeft,
	Bot,
	BrainCircuit,
	ChevronRight,
	Clock,
	GitBranch,
	User,
	X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { formatRelativeCompact } from "@/lib/format-date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { RouterOutputs } from "@/trpc/react";
import { api } from "@/trpc/react";

// ─── Types (inferred from tRPC, aliased for readability) ─────────

type TimelineEvent = RouterOutputs["timeline"]["listByBoard"][number];
type EventType = "all" | "activity" | "handoff" | "decision";
type ActorFilter = "all" | "agent" | "human";

// ─── Toggle Button ───────────────────────────────────────────────

type AgentTimelineProps = {
	boardId: string;
	projectId: string;
	onCardClick: (cardId: string) => void;
};

export function AgentTimeline({ boardId, projectId, onCardClick }: AgentTimelineProps) {
	const [open, setOpen] = useState(false);

	return (
		<>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant={open ? "secondary" : "outline"}
						size="sm"
						className="h-8 gap-1.5 text-xs"
						onClick={() => setOpen(!open)}
					>
						<Clock className="h-3.5 w-3.5" />
						Timeline
					</Button>
				</TooltipTrigger>
				<TooltipContent>Agent activity timeline</TooltipContent>
			</Tooltip>

			{open && (
				<TimelinePanel
					boardId={boardId}
					projectId={projectId}
					onCardClick={onCardClick}
					onClose={() => setOpen(false)}
				/>
			)}
		</>
	);
}

// ─── Panel ───────────────────────────────────────────────────────

function TimelinePanel({
	boardId,
	projectId,
	onCardClick,
	onClose,
}: AgentTimelineProps & { onClose: () => void }) {
	const { data: events } = api.timeline.listByBoard.useQuery({ boardId, projectId });

	const [eventType, setEventType] = useState<EventType>("all");
	const [actorFilter, setActorFilter] = useState<ActorFilter>("all");

	// "Since last visit" — read on mount, write on unmount
	const lastVisitRef = useRef<Date | null>(null);
	const storageKey = `timeline:lastVisit:${boardId}`;

	useEffect(() => {
		const stored = localStorage.getItem(storageKey);
		if (stored) lastVisitRef.current = new Date(stored);
		// Write on unmount so the next open sees events since panel was closed
		return () => {
			localStorage.setItem(storageKey, new Date().toISOString());
		};
	}, [storageKey]);

	const filtered = useMemo(() => {
		if (!events) return [];
		return events.filter((e) => {
			if (eventType !== "all" && e.type !== eventType) return false;
			// Actor filter applies to activities only — handoffs are always agent,
			// decisions use a free-form author string so we always show them
			if (actorFilter === "agent" && e.type === "activity" && e.actorType !== "AGENT") return false;
			if (actorFilter === "human") {
				if (e.type === "handoff") return false;
				if (e.type === "activity" && e.actorType !== "HUMAN") return false;
			}
			return true;
		});
	}, [events, eventType, actorFilter]);

	const newCount = useMemo(() => {
		if (!filtered.length || !lastVisitRef.current) return 0;
		return filtered.filter((e) => new Date(e.createdAt) > lastVisitRef.current!).length;
	}, [filtered]);

	return (
		<div className="fixed right-0 top-14 z-40 flex h-[calc(100dvh-3.5rem)] w-96 flex-col border-l bg-background shadow-lg">
			{/* Header */}
			<div className="flex items-center justify-between border-b px-4 py-3">
				<div className="flex items-center gap-2">
					<Clock className="h-4 w-4" />
					<h3 className="text-sm font-semibold">Timeline</h3>
					{newCount > 0 && (
						<Badge variant="default" className="px-1.5 py-0 text-2xs">
							{newCount} new
						</Badge>
					)}
				</div>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button variant="ghost" size="sm" onClick={onClose}>
							<X className="h-4 w-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Close timeline</TooltipContent>
				</Tooltip>
			</div>

			{/* Filters */}
			<div className="flex items-center gap-2 border-b px-4 py-2">
				<Select value={eventType} onValueChange={(v) => setEventType(v as EventType)}>
					<SelectTrigger className="h-7 w-28 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">All events</SelectItem>
						<SelectItem value="activity">Activity</SelectItem>
						<SelectItem value="handoff">Sessions</SelectItem>
						<SelectItem value="decision">Decisions</SelectItem>
					</SelectContent>
				</Select>
				<Select value={actorFilter} onValueChange={(v) => setActorFilter(v as ActorFilter)}>
					<SelectTrigger className="h-7 w-24 text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="all">Everyone</SelectItem>
						<SelectItem value="agent">Agent</SelectItem>
						<SelectItem value="human">Human</SelectItem>
					</SelectContent>
				</Select>
			</div>

			{/* Event List */}
			<div className="flex-1 overflow-y-auto">
				{filtered.length === 0 ? (
					<EmptyState
						icon={Clock}
						title="No activity"
						description={events?.length ? "Try changing the filters" : "Activity will appear as work happens"}
						className="py-8"
					/>
				) : (
					<div className="divide-y">
						{filtered.map((event, i) => {
							// Insert "since last visit" divider
							const showDivider =
								lastVisitRef.current &&
								i > 0 &&
								new Date(filtered[i - 1].createdAt) >= lastVisitRef.current &&
								new Date(event.createdAt) < lastVisitRef.current;

							return (
								<div key={event.id}>
									{showDivider && <LastVisitDivider />}
									<TimelineEntry event={event} onCardClick={onCardClick} />
								</div>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

// ─── "Since last visit" Divider ──────────────────────────────────

function LastVisitDivider() {
	return (
		<div className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/80 px-4 py-1.5 backdrop-blur-sm">
			<div className="h-px flex-1 bg-primary/30" />
			<span className="text-2xs font-medium text-primary/70">Since your last visit</span>
			<div className="h-px flex-1 bg-primary/30" />
		</div>
	);
}

// ─── Timeline Entry ──────────────────────────────────────────────

function TimelineEntry({
	event,
	onCardClick,
}: {
	event: TimelineEvent;
	onCardClick: (cardId: string) => void;
}) {
	switch (event.type) {
		case "activity":
			return <ActivityEntry event={event} onCardClick={onCardClick} />;
		case "handoff":
			return <HandoffEntry event={event} />;
		case "decision":
			return <DecisionEntry event={event} onCardClick={onCardClick} />;
	}
}

// ─── Activity Entry ──────────────────────────────────────────────

function ActivityEntry({
	event,
	onCardClick,
}: {
	event: Extract<TimelineEvent, { type: "activity" }>;
	onCardClick: (cardId: string) => void;
}) {
	const isMove = event.action === "moved";

	return (
		<button
			type="button"
			className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
			onClick={() => onCardClick(event.card.id)}
		>
			<div className="mt-0.5 shrink-0">
				{isMove ? (
					<ArrowRightLeft className="h-3.5 w-3.5 text-blue-500" />
				) : event.actorType === "AGENT" ? (
					<Bot className="h-3.5 w-3.5 text-violet-500" />
				) : (
					<User className="h-3.5 w-3.5 text-muted-foreground" />
				)}
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-xs">
					<span className="font-medium">
						{event.actorName ?? (event.actorType === "AGENT" ? "Claude" : "You")}
					</span>{" "}
					<span className="text-muted-foreground">
						{event.details ?? event.action}
					</span>
				</p>
				<div className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted-foreground">
					<span className="truncate font-mono">#{event.card.number}</span>
					<span className="truncate">{event.card.title}</span>
				</div>
				<span className="text-2xs text-muted-foreground/60">
					{formatRelativeCompact(new Date(event.createdAt))}
				</span>
			</div>
			<ChevronRight className="mt-1 h-3 w-3 shrink-0 text-muted-foreground/40" />
		</button>
	);
}

// ─── Handoff Entry ───────────────────────────────────────────────

function HandoffEntry({
	event,
}: {
	event: Extract<TimelineEvent, { type: "handoff" }>;
}) {
	return (
		<div className="flex items-start gap-3 px-4 py-3">
			<div className="mt-0.5 shrink-0">
				<GitBranch className="h-3.5 w-3.5 text-violet-500" />
			</div>
			<div className="min-w-0 flex-1">
				<p className="text-xs">
					<span className="font-medium">{event.agentName}</span>{" "}
					<span className="text-muted-foreground">ended session</span>
				</p>
				{event.summary && (
					<p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{event.summary}</p>
				)}
				<div className="mt-1 flex flex-wrap gap-1">
					{event.workingOn.length > 0 && (
						<Badge variant="outline" className="px-1 py-0 text-2xs">
							{event.workingOn.length} worked on
						</Badge>
					)}
					{event.nextSteps.length > 0 && (
						<Badge variant="outline" className="px-1 py-0 text-2xs">
							{event.nextSteps.length} next steps
						</Badge>
					)}
					{event.blockers.length > 0 && (
						<Badge variant="outline" className="border-red-500/20 px-1 py-0 text-2xs text-red-500">
							{event.blockers.length} blockers
						</Badge>
					)}
				</div>
				<span className="text-2xs text-muted-foreground/60">
					{formatRelativeCompact(new Date(event.createdAt))}
				</span>
			</div>
		</div>
	);
}

// ─── Decision Entry ──────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
	proposed: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
	accepted: "bg-green-500/10 text-green-600 border-green-500/20",
	rejected: "bg-red-500/10 text-red-600 border-red-500/20",
};

function DecisionEntry({
	event,
	onCardClick,
}: {
	event: Extract<TimelineEvent, { type: "decision" }>;
	onCardClick: (cardId: string) => void;
}) {
	const hasCard = event.card !== null;

	const content = (
		<>
			<div className="mt-0.5 shrink-0">
				<BrainCircuit className="h-3.5 w-3.5 text-amber-500" />
			</div>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-1.5">
					<p className="text-xs font-medium">{event.title}</p>
					<Badge
						variant="outline"
						className={`px-1 py-0 text-2xs ${STATUS_COLORS[event.status] ?? ""}`}
					>
						{event.status}
					</Badge>
				</div>
				<p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{event.decision}</p>
				<div className="mt-0.5 flex items-center gap-1.5 text-2xs text-muted-foreground/60">
					<span>{event.author === "AGENT" ? "Agent" : event.author}</span>
					{event.card && (
						<>
							<span>·</span>
							<span className="font-mono">#{event.card.number}</span>
						</>
					)}
					<span>·</span>
					<span>{formatRelativeCompact(new Date(event.createdAt))}</span>
				</div>
			</div>
			{hasCard && <ChevronRight className="mt-1 h-3 w-3 shrink-0 text-muted-foreground/40" />}
		</>
	);

	if (hasCard) {
		return (
			<button
				type="button"
				className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
				onClick={() => onCardClick(event.card!.id)}
			>
				{content}
			</button>
		);
	}

	return (
		<div className="flex items-start gap-3 px-4 py-3">
			{content}
		</div>
	);
}
