"use client";

import {
	Bot,
	CheckSquare,
	Clock,
	MessageSquare,
	Plus,
	Trash2,
	User,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Markdown } from "@/components/ui/markdown";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { priorityValues } from "@/lib/schemas/card-schemas";
import { api } from "@/trpc/react";

type CardDetailSheetProps = {
	cardId: string | null;
	boardId: string;
	onClose: () => void;
};

export function CardDetailSheet({ cardId, boardId, onClose }: CardDetailSheetProps) {
	const utils = api.useUtils();

	const { data: card } = api.card.getById.useQuery(
		{ id: cardId! },
		{ enabled: !!cardId },
	);

	const updateCard = api.card.update.useMutation({
		onSuccess: () => {
			utils.card.getById.invalidate({ id: cardId! });
			utils.board.getFull.invalidate({ id: boardId });
		},
		onError: (error) => toast.error(error.message),
	});

	const deleteCard = api.card.delete.useMutation({
		onSuccess: () => {
			utils.board.getFull.invalidate({ id: boardId });
			onClose();
			toast.success("Card deleted");
		},
		onError: (error) => toast.error(error.message),
	});

	const createChecklist = api.checklist.create.useMutation({
		onSuccess: () => {
			utils.card.getById.invalidate({ id: cardId! });
			utils.board.getFull.invalidate({ id: boardId });
		},
		onError: (error) => toast.error(error.message),
	});

	const updateChecklist = api.checklist.update.useMutation({
		onSuccess: () => {
			utils.card.getById.invalidate({ id: cardId! });
			utils.board.getFull.invalidate({ id: boardId });
		},
	});

	const deleteChecklist = api.checklist.delete.useMutation({
		onSuccess: () => {
			utils.card.getById.invalidate({ id: cardId! });
			utils.board.getFull.invalidate({ id: boardId });
		},
	});

	const createComment = api.comment.create.useMutation({
		onSuccess: () => {
			utils.card.getById.invalidate({ id: cardId! });
			utils.board.getFull.invalidate({ id: boardId });
		},
		onError: (error) => toast.error(error.message),
	});

	const [newChecklistItem, setNewChecklistItem] = useState("");
	const [newComment, setNewComment] = useState("");
	const [tagInput, setTagInput] = useState("");

	if (!card) return null;

	const tags: string[] = JSON.parse(card.tags);

	const handleAddTag = () => {
		if (!tagInput.trim()) return;
		const newTags = [...tags, tagInput.trim()];
		updateCard.mutate({ id: card.id, data: { tags: newTags } });
		setTagInput("");
	};

	const handleRemoveTag = (tag: string) => {
		const newTags = tags.filter((t) => t !== tag);
		updateCard.mutate({ id: card.id, data: { tags: newTags } });
	};

	return (
		<Sheet open={!!cardId} onOpenChange={() => onClose()}>
			<SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
				<SheetHeader>
					<SheetTitle className="pr-6">
						<div className="flex items-center gap-2">
							<span className="shrink-0 text-sm font-mono text-muted-foreground">#{card.number}</span>
							<Input
								value={card.title}
								onChange={(e) =>
									updateCard.mutate({
										id: card.id,
										data: { title: e.target.value },
									})
								}
								className="border-0 p-0 text-lg font-semibold shadow-none focus-visible:ring-0"
							/>
						</div>
					</SheetTitle>
					<SheetDescription className="flex items-center gap-2 text-xs">
						Created by {card.createdBy === "AGENT" ? "Agent" : "Human"}
						{card.assignee && (
							<>
								<span className="text-muted-foreground">|</span>
								Assigned to {card.assignee === "AGENT" ? "Agent" : "Human"}
							</>
						)}
					</SheetDescription>
				</SheetHeader>

				<div className="space-y-6 px-4 pb-6">
					{/* Priority & Assignee */}
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label>Priority</Label>
							<Select
								value={card.priority}
								onValueChange={(value) =>
									updateCard.mutate({ id: card.id, data: { priority: value as "NONE" | "LOW" | "MEDIUM" | "HIGH" | "URGENT" } })
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{priorityValues.map((p) => (
										<SelectItem key={p} value={p}>
											{p === "NONE" ? "None" : p.charAt(0) + p.slice(1).toLowerCase()}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label>Assignee</Label>
							<Select
								value={card.assignee ?? "NONE"}
								onValueChange={(value) =>
									updateCard.mutate({
										id: card.id,
										data: { assignee: value === "NONE" ? null : (value as "HUMAN" | "AGENT") },
									})
								}
							>
								<SelectTrigger>
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="NONE">Unassigned</SelectItem>
									<SelectItem value="HUMAN">Human</SelectItem>
									<SelectItem value="AGENT">Agent</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					{/* Description */}
					<div className="space-y-2">
						<Label>Description</Label>
						<Textarea
							value={card.description ?? ""}
							onChange={(e) =>
								updateCard.mutate({
									id: card.id,
									data: { description: e.target.value || undefined },
								})
							}
							placeholder="Add a description..."
							rows={4}
						/>
					</div>

					{/* Tags */}
					<div className="space-y-2">
						<Label>Tags</Label>
						<div className="flex flex-wrap gap-1">
							{tags.map((tag) => (
								<Badge
									key={tag}
									variant="secondary"
									className="cursor-pointer"
									onClick={() => handleRemoveTag(tag)}
								>
									{tag} &times;
								</Badge>
							))}
						</div>
						<div className="flex gap-2">
							<Input
								value={tagInput}
								onChange={(e) => setTagInput(e.target.value)}
								placeholder="Add tag (e.g. bug, feature:auth)"
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleAddTag();
									}
								}}
							/>
							<Button
								variant="outline"
								size="sm"
								onClick={handleAddTag}
								disabled={!tagInput.trim()}
							>
								Add
							</Button>
						</div>
					</div>

					<Separator />

					{/* Checklist */}
					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<CheckSquare className="h-4 w-4" />
							<Label>Checklist</Label>
							{card.checklists.length > 0 && (
								<span className="text-xs text-muted-foreground">
									{card.checklists.filter((c) => c.completed).length}/
									{card.checklists.length}
								</span>
							)}
						</div>
						<div className="space-y-1">
							{card.checklists.map((item) => (
								<div key={item.id} className="flex items-center gap-2">
									<input
										type="checkbox"
										checked={item.completed}
										onChange={() =>
											updateChecklist.mutate({
												id: item.id,
												data: { completed: !item.completed },
											})
										}
										className="h-4 w-4 rounded"
									/>
									<span
										className={`flex-1 text-sm ${item.completed ? "text-muted-foreground line-through" : ""}`}
									>
										{item.text}
									</span>
									<Button
										variant="ghost"
										size="icon"
										className="h-6 w-6"
										onClick={() => deleteChecklist.mutate({ id: item.id })}
									>
										<Trash2 className="h-3 w-3" />
									</Button>
								</div>
							))}
						</div>
						<form
							className="flex gap-2"
							onSubmit={(e) => {
								e.preventDefault();
								if (!newChecklistItem.trim()) return;
								createChecklist.mutate({
									cardId: card.id,
									text: newChecklistItem.trim(),
								});
								setNewChecklistItem("");
							}}
						>
							<Input
								value={newChecklistItem}
								onChange={(e) => setNewChecklistItem(e.target.value)}
								placeholder="Add item..."
								className="text-sm"
							/>
							<Button
								type="submit"
								variant="outline"
								size="sm"
								disabled={!newChecklistItem.trim()}
							>
								<Plus className="h-4 w-4" />
							</Button>
						</form>
					</div>

					<Separator />

					{/* Comments */}
					<div className="space-y-3">
						<div className="flex items-center gap-2">
							<MessageSquare className="h-4 w-4" />
							<Label>Comments</Label>
							{card.comments.length > 0 && (
								<span className="text-xs text-muted-foreground">
									{card.comments.length}
								</span>
							)}
						</div>
						<div className="space-y-3">
							{card.comments.map((comment) => (
								<div
									key={comment.id}
									className={`rounded-lg border p-3 ${
										comment.authorType === "AGENT"
											? "border-purple-500/20 bg-purple-500/5"
											: "border-border bg-muted/50"
									}`}
								>
									<div className="mb-1.5 flex items-center gap-2 text-xs text-muted-foreground">
										{comment.authorType === "AGENT" ? (
											<Bot className="h-3.5 w-3.5 text-purple-500" />
										) : (
											<User className="h-3.5 w-3.5" />
										)}
										<span className="font-medium">
											{comment.authorName ??
												(comment.authorType === "AGENT" ? "Claude" : "You")}
										</span>
										<span className="opacity-60">
											{formatRelativeTime(new Date(comment.createdAt))}
										</span>
									</div>
									<div className="text-sm">
									<Markdown>{comment.content}</Markdown>
								</div>
								</div>
							))}
						</div>
						<form
							className="flex gap-2"
							onSubmit={(e) => {
								e.preventDefault();
								if (!newComment.trim()) return;
								createComment.mutate({
									cardId: card.id,
									content: newComment.trim(),
									authorType: "HUMAN",
								});
								setNewComment("");
							}}
						>
							<Input
								value={newComment}
								onChange={(e) => setNewComment(e.target.value)}
								placeholder="Add a comment..."
								className="text-sm"
							/>
							<Button
								type="submit"
								variant="outline"
								size="sm"
								disabled={!newComment.trim()}
							>
								Send
							</Button>
						</form>
					</div>

					<Separator />

					{/* Activity log */}
					{card.activities.length > 0 && (
						<div className="space-y-3">
							<div className="flex items-center gap-2">
								<Clock className="h-4 w-4 text-muted-foreground" />
								<Label className="text-muted-foreground">Activity</Label>
							</div>
							<div className="space-y-2">
								{card.activities.map((activity) => (
									<div
										key={activity.id}
										className="flex items-start gap-2 text-xs text-muted-foreground"
									>
										<div className="mt-0.5 shrink-0">
											{activity.actorType === "AGENT" ? (
												<Bot className="h-3.5 w-3.5 text-purple-500" />
											) : (
												<User className="h-3.5 w-3.5" />
											)}
										</div>
										<div className="flex-1">
											<span className="font-medium">
												{activity.actorName ??
													(activity.actorType === "AGENT" ? "Claude" : "You")}
											</span>{" "}
											<ActivityDescription action={activity.action} details={activity.details} />
											<span className="ml-1.5 opacity-50">
												{formatRelativeTime(new Date(activity.createdAt))}
											</span>
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Delete */}
					<div className="pt-4">
						<Button
							variant="destructive"
							size="sm"
							onClick={() => {
								if (confirm("Delete this card?")) {
									deleteCard.mutate({ id: card.id });
								}
							}}
						>
							<Trash2 className="mr-2 h-4 w-4" />
							Delete Card
						</Button>
					</div>
				</div>
			</SheetContent>
		</Sheet>
	);
}

function ActivityDescription({ action, details }: { action: string; details: string | null }) {
	switch (action) {
		case "created":
			return <span>created this card</span>;
		case "moved":
			return <span>{details ?? "moved this card"}</span>;
		case "commented":
			return <span>added a comment</span>;
		case "checklist_completed":
			return <span>completed {details?.replace("Completed: ", "") ?? "a checklist item"}</span>;
		case "checklist_unchecked":
			return <span>unchecked {details?.replace("Unchecked: ", "") ?? "a checklist item"}</span>;
		default:
			return <span>{details ?? action}</span>;
	}
}

function formatRelativeTime(date: Date): string {
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);
	const diffMin = Math.floor(diffSec / 60);
	const diffHr = Math.floor(diffMin / 60);
	const diffDay = Math.floor(diffHr / 24);

	if (diffSec < 60) return "just now";
	if (diffMin < 60) return `${diffMin}m ago`;
	if (diffHr < 24) return `${diffHr}h ago`;
	if (diffDay < 7) return `${diffDay}d ago`;
	return date.toLocaleDateString();
}
