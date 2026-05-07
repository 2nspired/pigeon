import {
	Oswald,
	Playfair_Display,
	PT_Mono,
	Source_Serif_4,
	UnifrakturCook,
} from "next/font/google";

// The Daily Squawk (#298) — newspaper typography stack.
//
// Five faces, all self-hosted via `next/font/google` so the
// `--font-squawk-*` CSS variables drop into the cascade for everything
// rendered under the `/squawk/*` route subtree. Outside this layout the
// rest of the app keeps Geist Sans (defined in `src/app/layout.tsx`).
//
// Variable names mirror the existing `--font-geist-sans` pattern so the
// `@theme inline` aliases in `globals.css` can map them onto Tailwind
// utilities without any extra wiring.

const nameplate = UnifrakturCook({
	subsets: ["latin"],
	weight: "700",
	variable: "--font-squawk-nameplate",
	display: "swap",
});

const display = Playfair_Display({
	subsets: ["latin"],
	weight: ["700", "800", "900"],
	variable: "--font-squawk-display",
	display: "swap",
});

const body = Source_Serif_4({
	subsets: ["latin"],
	variable: "--font-squawk-body",
	display: "swap",
});

const kicker = Oswald({
	subsets: ["latin"],
	weight: ["500", "600"],
	variable: "--font-squawk-kicker",
	display: "swap",
});

const classified = PT_Mono({
	subsets: ["latin"],
	weight: "400",
	variable: "--font-squawk-classified",
	display: "swap",
});

export default function SquawkLayout({ children }: { children: React.ReactNode }) {
	return (
		<div
			className={`${nameplate.variable} ${display.variable} ${body.variable} ${kicker.variable} ${classified.variable}`}
		>
			{children}
		</div>
	);
}
