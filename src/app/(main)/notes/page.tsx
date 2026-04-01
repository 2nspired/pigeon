"use client";

import { ArrowUpRight, NotebookPen, Pencil, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Markdown } from "@/components/ui/markdown";
import { api } from "@/trpc/react";

export default function NotesPage() {
	const [createOpen, setCreateOpen] = useState(false);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [promoteId, setPromoteId] = useState<string | null>(null);
	const [title, setTitle] = useState("");
	const [content, setContent] = useState("");

	// Promote state
	const [promoteProjectId, setPromoteProjectId] = useState("");
	const [promoteBoardId, setPromoteBoardId] = useState("");
	const [promoteColumnId, setPromoteColumnId] = useState("");

	const utils = api.useUtils();

	const { data: notes, isLoading } = api.note.list.useQuery(undefined, {
		refetchInterval: 5000,
	});

	const { data: projects } = api.project.list.useQuery();

	const { data: boards } = api.board.list.useQuery(
		{ projectId: promoteProjectId },
		{ enabled: !!promoteProjectId },
	);

	const { data: board } = api.board.getFull.useQuery(
		{ id: promoteBoardId },
		{ enabled: !!promoteBoardId },
	);

	const createNote = api.note.create.useMutation({
		onSuccess: () => {
			utils.note.list.invalidate();
			setCreateOpen(false);
			setTitle("");
			setContent("");
			toast.success("Note created");
		},
		onError: (e) => toast.error(e.message),
	});

	const updateNote = api.note.update.useMutation({
		onSuccess: () => {
			utils.note.list.invalidate();
			setEditingId(null);
			setTitle("");
			setContent("");
			toast.success("Note updated");
		},
		onError: (e) => toast.error(e.message),
	});

	const deleteNote = api.note.delete.useMutation({
		onSuccess: () => {
			utils.note.list.invalidate();
			toast.success("Note deleted");
		},
		onError: (e) => toast.error(e.message),
	});

	const createCard = api.card.create.useMutation({
		onSuccess: () => {
			// Delete the note after promoting
			if (promoteId) {
				deleteNote.mutate({ id: promoteId });
			}
			setPromoteId(null);
			setPromoteProjectId("");
			setPromoteBoardId("");
			setPromoteColumnId("");
			toast.success("Note promoted to card");
		},
		onError: (e) => toast.error(e.message),
	});

	const handleCreate = (e: React.FormEvent) => {
		e.preventDefault();
		if (!title.trim()) return;
		createNote.mutate({ title: title.trim(), content: content.trim() });
	};

	const handleUpdate = (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingId || !title.trim()) return;
		updateNote.mutate({ id: editingId, data: { title: title.trim(), content: content.trim() } });
	};

	const handlePromote = () => {
		const note = notes?.find((n) => n.id === promoteId);
		if (!note || !promoteColumnId) return;
		createCard.mutate({
			columnId: promoteColumnId,
			title: note.title,
			description: note.content || undefined,
		});
	};

	const startEdit = (note: { id: string; title: string; content: string }) => {
		setEditingId(note.id);
		setTitle(note.title);
		setContent(note.content);
	};

	return (
		<div className="mx-auto max-w-3xl px-4 py-6">
			<div className="mb-6 flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-bold">Notes</h1>
					<p className="text-sm text-muted-foreground">
						Quick thoughts, ideas, and scratch space
					</p>
				</div>
				<Button onClick={() => setCreateOpen(true)}>
					<Plus className="mr-2 h-4 w-4" />
					New Note
				</Button>
			</div>

			{isLoading ? (
				<p className="text-sm text-muted-foreground">Loading...</p>
			) : !notes || notes.length === 0 ? (
				<div className="flex flex-col items-center gap-3 py-16 text-center">
					<NotebookPen className="h-10 w-10 text-muted-foreground/40" />
					<p className="text-muted-foreground">No notes yet.</p>
					<p className="text-sm text-muted-foreground">
						Jot down ideas, questions, or thoughts. Promote them to cards when they're ready.
					</p>
				</div>
			) : (
				<div className="space-y-3">
					{notes.map((note) => (
						<div
							key={note.id}
							className="group rounded-lg border bg-card p-4 transition-colors hover:bg-muted/30"
						>
							<div className="mb-2 flex items-start justify-between">
								<h3 className="font-medium">{note.title}</h3>
								<div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7"
										title="Promote to card"
										onClick={() => setPromoteId(note.id)}
									>
										<ArrowUpRight className="h-3.5 w-3.5" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7"
										onClick={() => startEdit(note)}
									>
										<Pencil className="h-3.5 w-3.5" />
									</Button>
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 text-destructive"
										onClick={() => {
											if (confirm("Delete this note?")) {
												deleteNote.mutate({ id: note.id });
											}
										}}
									>
										<Trash2 className="h-3.5 w-3.5" />
									</Button>
								</div>
							</div>
							{note.content && (
								<div className="text-sm text-muted-foreground">
									<Markdown>{note.content}</Markdown>
								</div>
							)}
							<p className="mt-2 text-[10px] text-muted-foreground/60">
								{new Date(note.updatedAt).toLocaleDateString("en-US", {
									month: "short",
									day: "numeric",
									hour: "2-digit",
									minute: "2-digit",
								})}
							</p>
						</div>
					))}
				</div>
			)}

			{/* Create dialog */}
			<Dialog open={createOpen} onOpenChange={setCreateOpen}>
				<DialogContent>
					<form onSubmit={handleCreate}>
						<DialogHeader>
							<DialogTitle>New Note</DialogTitle>
							<DialogDescription>Jot down a quick thought or idea.</DialogDescription>
						</DialogHeader>
						<div className="mt-4 space-y-4">
							<div className="space-y-2">
								<Label htmlFor="note-title">Title</Label>
								<Input
									id="note-title"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									placeholder="What's on your mind?"
									autoFocus
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="note-content">Content (optional, markdown supported)</Label>
								<Textarea
									id="note-content"
									value={content}
									onChange={(e) => setContent(e.target.value)}
									placeholder="Details, context, links..."
									rows={5}
								/>
							</div>
						</div>
						<DialogFooter className="mt-6">
							<Button type="submit" disabled={createNote.isPending || !title.trim()}>
								Save
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* Edit dialog */}
			<Dialog open={!!editingId} onOpenChange={() => setEditingId(null)}>
				<DialogContent>
					<form onSubmit={handleUpdate}>
						<DialogHeader>
							<DialogTitle>Edit Note</DialogTitle>
						</DialogHeader>
						<div className="mt-4 space-y-4">
							<div className="space-y-2">
								<Label htmlFor="edit-title">Title</Label>
								<Input
									id="edit-title"
									value={title}
									onChange={(e) => setTitle(e.target.value)}
									autoFocus
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="edit-content">Content</Label>
								<Textarea
									id="edit-content"
									value={content}
									onChange={(e) => setContent(e.target.value)}
									rows={5}
								/>
							</div>
						</div>
						<DialogFooter className="mt-6">
							<Button type="submit" disabled={updateNote.isPending || !title.trim()}>
								Save
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			{/* Promote to card dialog */}
			<Dialog open={!!promoteId} onOpenChange={() => setPromoteId(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Promote to Card</DialogTitle>
						<DialogDescription>
							Choose where to create the card. The note will be deleted after promotion.
						</DialogDescription>
					</DialogHeader>
					<div className="mt-4 space-y-4">
						<div className="space-y-2">
							<Label>Project</Label>
							<Select value={promoteProjectId} onValueChange={(v) => { setPromoteProjectId(v); setPromoteBoardId(""); setPromoteColumnId(""); }}>
								<SelectTrigger>
									<SelectValue placeholder="Select project" />
								</SelectTrigger>
								<SelectContent>
									{projects?.map((p) => (
										<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						{promoteProjectId && boards && (
							<div className="space-y-2">
								<Label>Board</Label>
								<Select value={promoteBoardId} onValueChange={(v) => { setPromoteBoardId(v); setPromoteColumnId(""); }}>
									<SelectTrigger>
										<SelectValue placeholder="Select board" />
									</SelectTrigger>
									<SelectContent>
										{boards.map((b) => (
											<SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
						{promoteBoardId && board && (
							<div className="space-y-2">
								<Label>Column</Label>
								<Select value={promoteColumnId} onValueChange={setPromoteColumnId}>
									<SelectTrigger>
										<SelectValue placeholder="Select column" />
									</SelectTrigger>
									<SelectContent>
										{board.columns.map((c) => (
											<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}
					</div>
					<DialogFooter className="mt-6">
						<Button
							onClick={handlePromote}
							disabled={!promoteColumnId || createCard.isPending}
						>
							Promote to Card
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
