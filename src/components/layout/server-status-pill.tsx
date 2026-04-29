"use client";

import { api } from "@/trpc/react";

export function ServerStatusPill() {
	const { data } = api.system.info.useQuery(undefined, {
		refetchOnWindowFocus: true,
		staleTime: 60_000,
	});

	if (!data) return null;

	return (
		<div
			className="hidden items-center gap-1.5 rounded-full border bg-background/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex"
			title={`Server up · v${data.version} (${data.mode})`}
		>
			<span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
			<span>v{data.version}</span>
			<span className="opacity-60">·</span>
			<span>{data.mode}</span>
		</div>
	);
}
