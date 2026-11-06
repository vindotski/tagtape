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
	/** Where browsers reach the API's public ZIP route. */
	publicUrl: string;
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
	return {
		apiUrl: apiUrl.replace(/\/+$/, ""),
		token,
		publicUrl: (env.PUBLIC_API_URL || apiUrl).replace(/\/+$/, ""),
	};
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
	/** Public link to the ZIP once it's ready. */
	downloadUrl?: string;
}

/** `null` when the job doesn't exist (anymore). Throws when the API is unreachable. */
export async function getJob(
	id: string,
	config: ApiConfig,
): Promise<JobView | null> {
	const response = await request(config, `/jobs/${encodeURIComponent(id)}`);
	if (response.status === 404) return null;
	if (!response.ok) throw new Error(`API answered ${response.status}`);
	const job = jobSnapshotSchema.parse(await response.json());
	return job.archiveReady
		? { job, downloadUrl: `${config.publicUrl}/jobs/${job.id}/archive` }
		: { job };
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

function request(config: ApiConfig, path: string, init: RequestInit = {}) {
	const doFetch = config.fetch ?? fetch;
	return doFetch(`${config.apiUrl}${path}`, {
		...init,
		headers: { ...init.headers, authorization: `Bearer ${config.token}` },
		signal: AbortSignal.timeout(10_000),
	});
}
