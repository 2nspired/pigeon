/**
 * Argument parsing for the `pigeon` CLI — pure, no I/O, unit-tested.
 *
 * Zero-question by default: every flag is an opt-out or an override, never a
 * prompt. `--yes` is accepted (and ignored) so scripted callers can be
 * explicit about the default they're already getting.
 */

export const KNOWN_COMMANDS = ["init", "connect"];

export const USAGE = `pigeon — one-command Pigeon install

Usage:
  npx @2nspired/pigeon init                 install Pigeon + connect this repo
  npx @2nspired/pigeon connect [dir]        connect a project to an existing install

Options:
  --ref <branch|tag>     checkout ref for the home clone (default: latest release tag)
  --home <dir>           Pigeon home checkout (default: $PIGEON_HOME or ~/.pigeon)
  --agent-name <name>    agent display name on the board (default: Claude)
  --no-claude            skip \`claude mcp add\`; write project .mcp.json instead
  --no-service           skip the macOS launchd service install
  --no-register          skip registering the current repo with Pigeon
  --yes                  accepted for scripting; init is already zero-question
  -h, --help             show this help
`;

/**
 * @typedef {object} CliArgs
 * @property {string | null} command
 * @property {string | null} target   Positional target dir (connect only).
 * @property {string | null} ref
 * @property {string | null} home
 * @property {string} agentName
 * @property {boolean} claude    False when --no-claude was passed.
 * @property {boolean} service   False when --no-service was passed.
 * @property {boolean} register  False when --no-register was passed.
 * @property {boolean} help
 * @property {string[]} errors
 */

/**
 * Parse `process.argv.slice(2)`. Never throws — collect errors so the caller
 * can print usage plus every problem at once.
 *
 * @param {string[]} argv
 * @returns {CliArgs}
 */
export function parseCliArgs(argv) {
	/** @type {CliArgs} */
	const args = {
		command: null,
		target: null,
		ref: null,
		home: null,
		agentName: "Claude",
		claude: true,
		service: true,
		register: true,
		help: false,
		errors: [],
	};

	const takesValue = new Map([
		["--ref", "ref"],
		["--home", "home"],
		["--agent-name", "agentName"],
	]);

	for (let i = 0; i < argv.length; i++) {
		const token = argv[i];
		if (token === "-h" || token === "--help") {
			args.help = true;
		} else if (token === "--no-claude") {
			args.claude = false;
		} else if (token === "--no-service") {
			args.service = false;
		} else if (token === "--no-register") {
			args.register = false;
		} else if (token === "--yes" || token === "-y") {
			// Zero-question is already the default; accepted for scripting.
		} else if (takesValue.has(token)) {
			const value = argv[i + 1];
			if (value === undefined || value.startsWith("--")) {
				args.errors.push(`${token} requires a value`);
			} else {
				args[/** @type {"ref"|"home"|"agentName"} */ (takesValue.get(token))] = value;
				i++;
			}
		} else if (token.startsWith("-")) {
			args.errors.push(`Unknown option: ${token}`);
		} else if (args.command === null) {
			if (KNOWN_COMMANDS.includes(token)) {
				args.command = token;
			} else {
				args.errors.push(`Unknown command: ${token}`);
			}
		} else if (args.command === "connect" && args.target === null) {
			args.target = token;
		} else {
			args.errors.push(`Unexpected argument: ${token}`);
		}
	}

	// AGENT_NAME lands verbatim in JSON we write — keep it JSON-safe.
	if (/["\\\n\r]/.test(args.agentName)) {
		args.errors.push("--agent-name must not contain quotes, backslashes, or newlines");
	}

	return args;
}
