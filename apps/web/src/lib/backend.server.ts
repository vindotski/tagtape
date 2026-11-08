/**
 * Guest accounts from Spotcraft's backend kit (`@spotcraft/kit`). Server-only:
 * the browser never talks to auth or the database, it only carries the
 * httpOnly session cookie set here.
 *
 * Needs DATABASE_URL (Spotcraft sets it when the app has a database),
 * AUTH_SECRET (32+ characters) and PUBLIC_URL. The backend is created on
 * first use, not at import: `vite build` imports this file without a database.
 */
import { type Backend, backendFromEnv, GuestLimitError } from "@spotcraft/kit";

let instance: Backend | undefined;

export function backend(): Backend {
	instance ??= backendFromEnv(process.env);
	return instance;
}

/** The part of the kit `ensureGuest` needs, so tests can pass a fake. */
export type GuestSource = Pick<Backend, "guest">;

export type GuestResult =
	| { ok: true; guestId: string; cookies: string[] }
	| { ok: false; retryAfterSeconds: number };

/**
 * The visitor's guest, created if they have none. Call it only on writes
 * (starting an album): page views must not create guests, or every crawler
 * and parallel first request would make one.
 *
 * `cookies` are the Set-Cookie values to send back: they set or refresh the
 * session. Too many new guests from one address gives `ok: false`.
 */
export async function ensureGuest(
	source: GuestSource,
	request: Request,
	clientAddress: string,
): Promise<GuestResult> {
	try {
		const { guest, headers } = await source.guest(request, { clientAddress });
		return { ok: true, guestId: guest.id, cookies: headers.getSetCookie() };
	} catch (error) {
		if (error instanceof GuestLimitError) {
			return { ok: false, retryAfterSeconds: error.retryAfterSeconds };
		}
		throw error;
	}
}
