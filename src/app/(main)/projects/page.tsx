"use client";

import { BookOpen, Bot, FolderOpen, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { CreateProjectDialog } from "@/components/project/create-project-dialog";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { COLOR_CLASSES } from "@/lib/project-colors";
import { PROJECT_COLORS, type ProjectColor } from "@/lib/schemas/project-schemas";
import { api } from "@/trpc/react";

function ColorPicker({
	value,
	onChange,
}: {
	value: ProjectColor;
	onChange: (color: ProjectColor) => void;
}) {
	return (
		<div className="flex flex-wrap gap-1.5">
			{PROJECT_COLORS.map((color) => (
				<button
					key={color}
					type="button"
					onClick={() => onChange(color)}
					className={`h-6 w-6 rounded-full ${COLOR_CLASSES[color].bg} transition-all ${
						value === color
							? "ring-2 ring-ring ring-offset-2 ring-offset-background"
							: "hover:scale-110"
					}`}
					title={color}
				/>
			))}
		</div>
	);
}

export default function ProjectsPage() {
	const [deleteId, setDeleteId] = useState<string | null>(null);
	const [editId, setEditId] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editDescription, setEditDescription] = useState("");
	const [editColor, setEditColor] = useState<ProjectColor>("slate");

	const utils = api.useUtils();
	const { data: projects, isLoading } = api.project.list.useQuery();

	const seedTutorial = api.project.seedTutorial.useMutation({
		onSuccess: (data) => {
			utils.project.list.invalidate();
			toast.success(
				data.alreadyExists ? "Tutorial project already exists" : "Tutorial project created!"
			);
		},
		onError: (e) => toast.error(e.message),
	});

	const deleteProject = api.project.delete.useMutation({
		onSuccess: () => {
			utils.project.list.invalidate();
			setDeleteId(null);
			toast.success("Project deleted");
		},
		onError: (e) => toast.error(e.message),
	});

	const updateProject = api.project.update.useMutation({
		onSuccess: () => {
			utils.project.list.invalidate();
			setEditId(null);
			toast.success("Project updated");
		},
		onError: (e) => toast.error(e.message),
	});

	const projectToDelete = projects?.find((p) => p.id === deleteId);

	const startEdit = (project: {
		id: string;
		name: string;
		description: string | null;
		color: string;
	}) => {
		setEditId(project.id);
		setEditName(project.name);
		setEditDescription(project.description ?? "");
		setEditColor(project.color as ProjectColor);
	};

	const handleUpdate = (e: React.FormEvent) => {
		e.preventDefault();
		if (!editId || !editName.trim()) return;
		updateProject.mutate({
			id: editId,
			data: {
				name: editName.trim(),
				description: editDescription.trim() || undefined,
				color: editColor,
			},
		});
	};

	return (
		<div className="container mx-auto px-4 py-6">
			<div className="flex items-center justify-between">
				<div>
					<h1 className="text-3xl font-bold tracking-tight">Projects</h1>
					<p className="text-muted-foreground">Manage your projects and boards.</p>
				</div>
				<CreateProjectDialog />
			</div>

			<div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{isLoading ? (
					Array.from({ length: 3 }).map((_, i) => (
						<Card key={i}>
							<CardHeader>
								<Skeleton className="h-5 w-32" />
								<Skeleton className="h-4 w-48" />
							</CardHeader>
						</Card>
					))
				) : projects?.length === 0 ? (
					<div className="col-span-full flex flex-col items-center justify-center py-16 text-center">
						<FolderOpen className="mb-4 h-12 w-12 text-muted-foreground" />
						<h2 className="text-lg font-semibold">Welcome to Project Tracker</h2>
						<p className="mt-1 max-w-md text-sm text-muted-foreground">
							Create your first project, or explore the tutorial project to learn how everything
							works.
						</p>
						<div className="mt-6 flex items-center gap-3">
							<CreateProjectDialog />
							<Button
								variant="outline"
								onClick={() => seedTutorial.mutate()}
								disabled={seedTutorial.isPending}
							>
								{seedTutorial.isPending ? (
									<Loader2 className="mr-2 h-4 w-4 animate-spin" />
								) : (
									<BookOpen className="mr-2 h-4 w-4" />
								)}
								Create Tutorial Project
							</Button>
						</div>
					</div>
				) : (
					projects?.map((project) => {
						const colorKey = (project.color as ProjectColor) || "slate";
						return (
							<div key={project.id} className="group relative">
								<Link href={`/projects/${project.id}`}>
									<Card
										className={`border-l-[4px] ${COLOR_CLASSES[colorKey].border} transition-colors hover:bg-muted/50`}
									>
										<CardHeader className="pb-3">
											<CardTitle className="text-lg">{project.name}</CardTitle>
											{project.description && (
												<CardDescription>{project.description}</CardDescription>
											)}
										</CardHeader>
										<div className="flex items-center gap-3 px-6 pb-4 text-xs text-muted-foreground">
											<span>
												{project._count.boards} board{project._count.boards !== 1 ? "s" : ""}
											</span>
											<span>
												{project._count.cards} card{project._count.cards !== 1 ? "s" : ""}
											</span>
											{project.hasAgentCards && (
												<TooltipProvider>
													<Tooltip>
														<TooltipTrigger asChild>
															<span className="flex items-center gap-1 text-violet-500">
																<Bot className="h-3 w-3" />
																Agent
															</span>
														</TooltipTrigger>
														<TooltipContent>
															An AI agent has created cards in this project
														</TooltipContent>
													</Tooltip>
												</TooltipProvider>
											)}
										</div>
									</Card>
								</Link>
								<div className="absolute top-3 right-3 opacity-0 transition-opacity group-hover:opacity-100">
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												variant="ghost"
												size="icon"
												className="h-7 w-7"
												onClick={(e) => e.preventDefault()}
											>
												<MoreHorizontal className="h-4 w-4" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="end">
											<DropdownMenuItem onClick={() => startEdit(project)}>
												<Pencil className="mr-2 h-3.5 w-3.5" />
												Edit
											</DropdownMenuItem>
											<DropdownMenuItem
												className="text-destructive"
												onClick={() => setDeleteId(project.id)}
											>
												<Trash2 className="mr-2 h-3.5 w-3.5" />
												Delete
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</div>
							</div>
						);
					})
				)}
			</div>

			{/* Delete confirmation */}
			<AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete project?</AlertDialogTitle>
						<AlertDialogDescription>
							This will permanently delete <strong>{projectToDelete?.name}</strong> and all its
							boards, cards, and notes. This action cannot be undone.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={() => {
								if (deleteId) deleteProject.mutate({ id: deleteId });
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

			{/* Edit dialog */}
			<Dialog open={!!editId} onOpenChange={() => setEditId(null)}>
				<DialogContent>
					<form onSubmit={handleUpdate}>
						<DialogHeader>
							<DialogTitle>Edit Project</DialogTitle>
						</DialogHeader>
						<div className="mt-4 space-y-4">
							<div className="space-y-2">
								<Label htmlFor="edit-project-name">Name</Label>
								<Input
									id="edit-project-name"
									value={editName}
									onChange={(e) => setEditName(e.target.value)}
									autoFocus
								/>
							</div>
							<div className="space-y-2">
								<Label htmlFor="edit-project-desc">Description</Label>
								<Textarea
									id="edit-project-desc"
									value={editDescription}
									onChange={(e) => setEditDescription(e.target.value)}
									rows={3}
								/>
							</div>
							<div className="space-y-2">
								<Label>Color</Label>
								<ColorPicker value={editColor} onChange={setEditColor} />
							</div>
						</div>
						<DialogFooter className="mt-6">
							<Button type="submit" disabled={updateProject.isPending || !editName.trim()}>
								Save
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</div>
	);
}
