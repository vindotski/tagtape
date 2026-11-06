/**
 * Server-only client for @tagtape/api. The `.server.ts` suffix opts into
 * TanStack Start's import protection, so the bearer token can never end up
 * in a browser bundle.
 */
import {
	type AlbumInput,
	createJobResponseSchema,
	type JobSnapshot,
	jobSnapshotSchema,
} from "@tagtape/shared";

export interface ApiConfig {
	/** Where the web server reaches the API, e.g. a private network address. */
	apiUrl: string;
	/** Bearer token shared with the API (API_TOKEN). */
	token: string;
	fetch?: typeof fetch;
}

export function apiConfigFromEnv(
	env: NodeJS.ProcessEnv = process.env,
): ApiConfig {
	const apiUrl = env.API_URL;
	const token = env.API_TOKEN;
	if (!apiUrl || !token) {
		throw new Error("API_URL and API_TOKEN must be set for the web server");
	}
	return { apiUrl: apiUrl.replace(/\/+$/, ""), token };
}

export type CreateJobResult =
	| { ok: true; jobId: string }
	| {
			ok: false;
			message: string;
			/** Field errors keyed like the form: `title`, `tracks.0.url`, … */
			fieldErrors?: Record<string, string>;
	  };

const UNAVAILABLE =
	"TagTape's converter isn't reachable right now. Please try again in a minute.";

export async function createJob(
	album: AlbumInput,
	config: ApiConfig,
): Promise<CreateJobResult> {
	let response: Response;
	try {
		response = await request(config, "/jobs", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(album),
		});
	} catch {
		return { ok: false, message: UNAVAILABLE };
	}

	if (response.status === 202) {
		const { jobId } = createJobResponseSchema.parse(await response.json());
		return { ok: true, jobId };
	}
	const body = (await response.json().catch(() => ({}))) as {
		message?: string;
		issues?: Array<{ path?: string; message?: string }>;
	};
	if (response.status === 400) {
		return {
			ok: false,
			message: "Some fields need attention.",
			fieldErrors: issuesToFieldErrors(body.issues ?? []),
		};
	}
	if (response.status === 429) {
		return {
			ok: false,
			message:
				body.message ??
				"TagTape is busy right now. Please try again in a minute.",
		};
	}
	return { ok: false, message: UNAVAILABLE };
}

export interface JobView {
	job: JobSnapshot;
	/** Same-origin link to the ZIP once it's ready (served by the /download route). */
	downloadUrl?: string;
}

/** Same-origin path that streams a finished job's ZIP. */
export const downloadPath = (id: string) => `/download/${id}`;

/** `null` when the job doesn't exist (anymore). Throws when the API is unreachable. */
export async function getJob(
	id: string,
	config: ApiConfig,
): Promise<JobView | null> {
	const response = await request(config, `/jobs/${encodeURIComponent(id)}`);
	if (response.status === 404) return null;
	if (!response.ok) throw new Error(`API answered ${response.status}`);
	const job = jobSnapshotSchema.parse(await response.json());
	return job.downloadReady
		? { job, downloadUrl: downloadPath(job.id) }
		: { job };
}

/** Headers worth passing from the API's ZIP response to the browser. */
const ARCHIVE_HEADERS = [
	"content-type",
	"content-length",
	"content-disposition",
	"cache-control",
];

/** How long to wait for the download to *start* (it may queue for a slot). */
const DOWNLOAD_START_TIMEOUT_MS = 15 * 60_000;

/**
 * Streams a job's ZIP from the internal API to the browser, so the API never
 * needs a public port. The body is piped through without buffering.
 *
 * The download *is* the conversion and can take a long time, so only the wait
 * for it to start is timed. `clientSignal` is the browser's connection:
 * when the browser leaves, the API request is aborted and the conversion stops.
 */
export async function streamArchive(
	id: string,
	config: ApiConfig,
	clientSignal?: AbortSignal,
): Promise<Response> {
	const start = new AbortController();
	const timer = setTimeout(() => start.abort(), DOWNLOAD_START_TIMEOUT_MS);
	const signal = clientSignal
		? AbortSignal.any([clientSignal, start.signal])
		: start.signal;

	let upstream: Response;
	try {
		upstream = await request(
			config,
			`/jobs/${encodeURIComponent(id)}/archive`,
			{
				signal,
			},
		);
	} catch {
		return new Response("TagTape's converter isn't reachable right now.", {
			status: 502,
		});
	} finally {
		clearTimeout(timer);
	}
	if (upstream.status === 409 || upstream.status === 429) {
		// Already downloading, or too busy: say so instead of a generic error.
		const body = (await upstream.json().catch(() => ({}))) as {
			message?: string;
		};
		return new Response(body.message ?? "Please try again in a minute.", {
			status: upstream.status,
			headers: upstream.headers.get("retry-after")
				? { "retry-after": upstream.headers.get("retry-after") as string }
				: {},
		});
	}
	if (!upstream.ok || !upstream.body) {
		return new Response("This download doesn't exist or has expired.", {
			status: upstream.status === 404 ? 404 : 502,
		});
	}
	const headers = new Headers();
	for (const name of ARCHIVE_HEADERS) {
		const value = upstream.headers.get(name);
		if (value) headers.set(name, value);
	}
	return new Response(upstream.body, { status: 200, headers });
}

/** API issue paths (`/tracks/0/url`) → form field keys (`tracks.0.url`). */
export function issuesToFieldErrors(
	issues: Array<{ path?: string; message?: string }>,
): Record<string, string> {
	const errors: Record<string, string> = {};
	for (const issue of issues) {
		const key = (issue.path ?? "").replace(/^\//, "").replaceAll("/", ".");
		if (issue.message && !(key in errors)) errors[key] = issue.message;
	}
	return errors;
}

/** Calls the API with the token. Without a `signal`, gives up after 10 s. */
function request(config: ApiConfig, path: string, init: RequestInit = {}) {
	const doFetch = config.fetch ?? fetch;
	return doFetch(`${config.apiUrl}${path}`, {
		...init,
		headers: { ...init.headers, authorization: `Bearer ${config.token}` },
		signal: init.signal ?? AbortSignal.timeout(10_000),
	});
}
