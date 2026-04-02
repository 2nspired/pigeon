import type { ProjectColor } from "@/lib/schemas/project-schemas";

export const COLOR_CLASSES: Record<ProjectColor, { bg: string; border: string }> = {
	slate: { bg: "bg-slate-500", border: "border-l-slate-500" },
	red: { bg: "bg-red-500", border: "border-l-red-500" },
	orange: { bg: "bg-orange-500", border: "border-l-orange-500" },
	amber: { bg: "bg-amber-500", border: "border-l-amber-500" },
	yellow: { bg: "bg-yellow-500", border: "border-l-yellow-500" },
	lime: { bg: "bg-lime-500", border: "border-l-lime-500" },
	green: { bg: "bg-green-500", border: "border-l-green-500" },
	emerald: { bg: "bg-emerald-500", border: "border-l-emerald-500" },
	teal: { bg: "bg-teal-500", border: "border-l-teal-500" },
	cyan: { bg: "bg-cyan-500", border: "border-l-cyan-500" },
	sky: { bg: "bg-sky-500", border: "border-l-sky-500" },
	blue: { bg: "bg-blue-500", border: "border-l-blue-500" },
	indigo: { bg: "bg-indigo-500", border: "border-l-indigo-500" },
	violet: { bg: "bg-violet-500", border: "border-l-violet-500" },
	purple: { bg: "bg-purple-500", border: "border-l-purple-500" },
	fuchsia: { bg: "bg-fuchsia-500", border: "border-l-fuchsia-500" },
	pink: { bg: "bg-pink-500", border: "border-l-pink-500" },
	rose: { bg: "bg-rose-500", border: "border-l-rose-500" },
};
