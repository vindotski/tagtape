// Container entrypoint: runs the TagTape API (internal) and web app (public)
// side by side. tini (PID 1) starts this file; it starts both apps, forwards
// shutdown signals, and exits as soon as either app dies so the orchestrator
// restarts the whole container, which keeps web and API in lockstep.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = process.env;

// The token only protects the hop from web to API inside this container, so a
// fresh random one per start is enough. Set API_TOKEN to expose the API on purpose.
const apiToken = env.API_TOKEN || randomBytes(32).toString("hex");
const apiHost = env.API_HOST || "127.0.0.1";
const apiPort = env.API_PORT || "4000";
const webPort = env.PORT || "3000";

const children = new Map();
let stopping = false;
let exitCode = 0;

function start(name, args, extraEnv) {
	const child = spawn(process.execPath, args, {
		cwd: root,
		stdio: "inherit",
		env: { ...env, API_TOKEN: apiToken, ...extraEnv },
	});
	children.set(name, child);
	child.on("exit", (code, signal) => {
		children.delete(name);
		if (!stopping) {
			console.error(
				`[tagtape] ${name} exited (${signal ?? `code ${code}`}), stopping the container`,
			);
			stop(code || 1);
		} else if (children.size === 0) {
			process.exit(exitCode);
		}
	});
}

function stop(code) {
	if (stopping) return;
	stopping = true;
	exitCode = code;
	for (const child of children.values()) child.kill("SIGTERM");
	if (children.size === 0) process.exit(code);
	// Don't hang forever if a child ignores SIGTERM.
	setTimeout(() => {
		for (const child of children.values()) child.kill("SIGKILL");
		process.exit(code || 1);
	}, 15_000).unref();
}

process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));

start("api", ["apps/api/src/server.ts"], { HOST: apiHost, PORT: apiPort });
start(
	"web",
	[
		"apps/web/node_modules/srvx/bin/srvx.mjs",
		"serve",
		"--prod",
		"--entry",
		"apps/web/dist/server/server.js",
		// srvx resolves --static relative to the entry file's directory.
		"--static",
		"../client",
		"--host",
		"0.0.0.0",
		"--port",
		webPort,
	],
	{ API_URL: `http://127.0.0.1:${apiPort}`, NODE_ENV: "production" },
);
