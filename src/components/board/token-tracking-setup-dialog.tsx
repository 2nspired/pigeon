"use client";

import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet";
import { formatRelative } from "@/lib/format-date";
import { TOKEN_TRACKING_DOCS_URL, TOKEN_TRACKING_HOOK_SNIPPET } from "@/lib/token-tracking-docs";
import { useMediaQuery } from "@/lib/use-media-query";
import type { RouterOutputs } from "@/trpc/react";
import { api } from "@/trpc/react";

type Diagnostics = RouterOutputs["tokenUsage"]["getDiagnostics"];

type SetupState = "loading" | "not-configured" | "no-events" | "stale" | "working";

function deriveState(d: Diagnostics | undefined): SetupState {
	if (!d) return "loading";
	const hasHook = d.configPaths.some((c) => c.hasHook);
	if (!hasHook) return "not-configured";
	if (d.eventCount === 0 || !d.lastEventAt) return "no-events";
	const ageMs = Date.now() - new Date(d.lastEventAt).getTime();
	return ageMs > 7 * 24 * 60 * 60 * 1000 ? "stale" : "working";
}

type TokenTrackingSetupDialogProps = {
	/** Render-prop trigger so callers control the visual affordance (link vs button). */
	trigger: ReactNode;
};

export function TokenTrackingSetupDialog({ trigger }: TokenTrackingSetupDialogProps) {
	const [open, setOpen] = useState(false);
	const isDesktop = useMediaQuery("(min-width: 640px)");

	const body = <SetupDialogBody enabled={open} />;

	if (isDesktop) {
		return (
			<Dialog open={open} onOpenChange={setOpen}>
				<DialogTrigger asChild>{trigger}</DialogTrigger>
				<DialogContent className="sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>Set up token tracking</DialogTitle>
						<DialogDescription>
							Add a Stop hook so Claude Code reports per-session token usage when each session ends.
							Tracking is opt-in — Pigeon never reads transcripts on its own.
						</DialogDescription>
					</DialogHeader>
					{body}
				</DialogContent>
			</Dialog>
		);
	}

	return (
		<Sheet open={open} onOpenChange={setOpen}>
			<SheetTrigger asChild>{trigger}</SheetTrigger>
			<SheetContent side="bottom" className="max-h-[90vh] gap-0 overflow-y-auto p-0">
				<SheetHeader className="border-b px-5 py-4">
					<SheetTitle>Set up token tracking</SheetTitle>
					<SheetDescription>
						Add a Stop hook so Claude Code reports per-session token usage when each session ends.
						Tracking is opt-in — Pigeon never reads transcripts on its own.
					</SheetDescription>
				</SheetHeader>
				<div className="px-5 py-4">{body}</div>
			</SheetContent>
		</Sheet>
	);
}

function SetupDialogBody({ enabled }: { enabled: boolean }) {
	const { data, refetch, isFetching } = api.tokenUsage.getDiagnostics.useQuery(undefined, {
		enabled,
		staleTime: 0,
	});
	const state = deriveState(data);

	return (
		<div className="space-y-4">
			<HookSnippetSection />
			<ConfigPathsSection diagnostics={data} />
			<StatusSection
				diagnostics={data}
				state={state}
				onRefresh={() => refetch()}
				refreshing={isFetching}
			/>
			<ReadMoreFooter />
		</div>
	);
}

// ─── Hook JSON snippet + Copy ────────────────────────────────────────

function HookSnippetSection() {
	const [copied, setCopied] = useState(false);

	const onCopy = async () => {
		try {
			await navigator.clipboard.writeText(TOKEN_TRACKING_HOOK_SNIPPET);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1500);
		} catch {
			// Clipboard can fail in non-secure contexts (HTTP) or when permission
			// is denied. Fall back to leaving the user to select manually — the
			// snippet is fully visible and selectable.
		}
	};

	return (
		<section className="space-y-2">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-medium">1. Add the hook</h3>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={onCopy}
					className="h-7 gap-1.5 px-2 text-xs"
				>
					{copied ? (
						<>
							<Check className="h-3 w-3" />
							Copied
						</>
					) : (
						<>
							<Copy className="h-3 w-3" />
							Copy
						</>
					)}
				</Button>
			</div>
			<pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-2xs leading-relaxed">
				{TOKEN_TRACKING_HOOK_SNIPPET}
			</pre>
			<p className="text-xs text-muted-foreground">
				The hook fires when a Claude Code session exits. Sub-agent transcripts at
				<code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
					&lt;dirname&gt;/&lt;sessionId&gt;/subagents/agent-*.jsonl
				</code>
				are aggregated alongside the parent.
			</p>
		</section>
	);
}

// ─── Detected config paths ───────────────────────────────────────────

function ConfigPathsSection({ diagnostics }: { diagnostics: Diagnostics | undefined }) {
	if (!diagnostics) {
		return (
			<section className="space-y-2">
				<h3 className="text-sm font-medium">2. Where to put it</h3>
				<p className="text-xs text-muted-foreground">Detecting your Claude config…</p>
			</section>
		);
	}
	const existing = diagnostics.configPaths.filter((c) => c.exists);

	return (
		<section className="space-y-2">
			<h3 className="text-sm font-medium">2. Where to put it</h3>
			{existing.length === 0 ? (
				<p className="text-xs text-muted-foreground">
					Couldn't find a Claude Code config at <code>~/.claude/.claude.json</code> or{" "}
					<code>~/.claude-alt/.claude.json</code>. If you have one elsewhere, paste the snippet
					above into its <code>hooks</code> object.
				</p>
			) : (
				<ul className="space-y-1.5 text-xs">
					{existing.map((c) => (
						<li key={c.path} className="flex items-start gap-2">
							<span className="mt-0.5 inline-flex h-3 w-3 shrink-0 items-center justify-center">
								{c.hasHook ? (
									<Check className="h-3 w-3 text-emerald-500" />
								) : (
									<span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
								)}
							</span>
							<div className="min-w-0 flex-1">
								<code className="break-all font-mono text-[11px]">{c.path}</code>
								<div className="text-2xs text-muted-foreground">
									{c.hasHook ? "Hook configured" : "Hook not found — paste the snippet above"}
								</div>
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

// ─── Verify status ───────────────────────────────────────────────────

const STATE_STYLE: Record<SetupState, { border: string; label: string; tone: string }> = {
	loading: { border: "border-l-muted", label: "Checking…", tone: "text-muted-foreground" },
	"not-configured": {
		border: "border-l-muted-foreground/40",
		label: "Not configured",
		tone: "text-muted-foreground",
	},
	"no-events": {
		border: "border-l-amber-500",
		label: "Hook detected — no events yet",
		tone: "text-amber-700 dark:text-amber-400",
	},
	stale: {
		border: "border-l-amber-500",
		label: "Hook detected — events stale",
		tone: "text-amber-700 dark:text-amber-400",
	},
	working: {
		border: "border-l-emerald-500",
		label: "Working",
		tone: "text-emerald-700 dark:text-emerald-400",
	},
};

function StatusSection({
	diagnostics,
	state,
	onRefresh,
	refreshing,
}: {
	diagnostics: Diagnostics | undefined;
	state: SetupState;
	onRefresh: () => void;
	refreshing: boolean;
}) {
	const style = STATE_STYLE[state];

	return (
		<section className="space-y-2">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-medium">3. Verify</h3>
				<Button
					type="button"
					size="sm"
					variant="outline"
					onClick={onRefresh}
					disabled={refreshing}
					className="h-7 gap-1.5 px-2 text-xs"
				>
					<RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
					Re-check
				</Button>
			</div>
			<div className={`space-y-1.5 rounded-md border border-l-4 bg-muted/20 p-3 ${style.border}`}>
				<div className={`text-xs font-medium ${style.tone}`}>{style.label}</div>
				<StatusMessage state={state} diagnostics={diagnostics} />
			</div>
			{diagnostics && (
				<dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 font-mono text-2xs text-muted-foreground">
					<dt>events recorded</dt>
					<dd className="tabular-nums text-foreground">{diagnostics.eventCount}</dd>
					<dt>last event</dt>
					<dd className="tabular-nums text-foreground">
						{diagnostics.lastEventAt ? formatRelative(diagnostics.lastEventAt) : "never"}
					</dd>
					{diagnostics.projectsWithoutRepoPath > 0 && (
						<>
							<dt>projects missing repoPath</dt>
							<dd className="tabular-nums text-foreground">
								{diagnostics.projectsWithoutRepoPath}
							</dd>
						</>
					)}
				</dl>
			)}
		</section>
	);
}

function StatusMessage({
	state,
	diagnostics,
}: {
	state: SetupState;
	diagnostics: Diagnostics | undefined;
}) {
	if (state === "loading") return null;

	if (state === "not-configured") {
		return (
			<p className="text-xs text-muted-foreground">
				Add the hook above to your Claude Code config, then re-check.
			</p>
		);
	}

	if (state === "working") {
		return (
			<p className="text-xs text-muted-foreground">
				Token usage is being recorded. Costs will appear on cards, sessions, and the Pulse strip.
			</p>
		);
	}

	const missing = diagnostics?.projectsWithoutRepoPath ?? 0;

	if (state === "no-events") {
		return (
			<div className="space-y-1.5 text-xs text-muted-foreground">
				<p>The hook is wired up, but no events have been recorded yet. Likely causes:</p>
				<ul className="list-disc space-y-0.5 pl-4">
					<li>You haven't ended a Claude Code session since adding the hook — run one and exit.</li>
					{missing > 0 && (
						<li>
							{missing} project{missing === 1 ? "" : "s"} missing <code>repoPath</code>. The hook
							resolves <code>cwd</code> to a project via <code>repoPath</code>; sessions in
							unregistered repos drop silently.
						</li>
					)}
					<li>
						Your Claude Code version may not support <code>type: "mcp_tool"</code> hooks. Check the
						release notes or restart Claude Code after editing the config.
					</li>
				</ul>
			</div>
		);
	}

	// stale
	return (
		<div className="space-y-1.5 text-xs text-muted-foreground">
			<p>
				No events in the last 7 days. The hook is configured but may not be firing on recent
				sessions.
			</p>
			{missing > 0 && (
				<p>
					{missing} project{missing === 1 ? "" : "s"} are missing <code>repoPath</code>, which can
					cause silent drops.
				</p>
			)}
		</div>
	);
}

// ─── Read more footer ────────────────────────────────────────────────

function ReadMoreFooter() {
	return (
		<div className="border-t pt-3">
			<a
				href={TOKEN_TRACKING_DOCS_URL}
				target="_blank"
				rel="noopener noreferrer"
				className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
			>
				Read full docs in AGENTS.md
				<ExternalLink className="h-3 w-3" />
			</a>
		</div>
	);
}
