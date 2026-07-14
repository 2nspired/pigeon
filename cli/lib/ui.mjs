/**
 * Terminal output helpers — mirrors the palette in `scripts/doctor.ts` so the
 * CLI and the doctor pass read as one voice.
 */

const COLORS = {
	reset: "\x1b[0m",
	dim: "\x1b[2m",
	bold: "\x1b[1m",
	green: "\x1b[32m",
	red: "\x1b[31m",
	yellow: "\x1b[33m",
	cyan: "\x1b[36m",
	gray: "\x1b[90m",
};

const noColor = process.env.NO_COLOR === "1" || !process.stdout.isTTY;

/**
 * @param {keyof typeof COLORS} c
 * @param {string} s
 */
export function color(c, s) {
	return noColor ? s : `${COLORS[c]}${s}${COLORS.reset}`;
}

/** @param {string} title */
export function step(title) {
	console.log("");
	console.log(color("bold", title));
}

/** @param {string} message */
export function ok(message) {
	console.log(`${color("green", "✓")} ${message}`);
}

/** @param {string} message */
export function skip(message) {
	console.log(`${color("gray", "·")} ${message}`);
}

/** @param {string} message */
export function warn(message) {
	console.log(`${color("yellow", "!")} ${message}`);
}

/** @param {string} message */
export function info(message) {
	console.log(`  ${color("dim", message)}`);
}
