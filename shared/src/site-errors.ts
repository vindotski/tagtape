// What yt-dlp's errors mean for the person using TagTape. Pure text handling,
// shared by the desktop app (yt-dlp as a process) and the mobile app (yt-dlp
// in-process).

export const UNSUPPORTED_LINK = "TagTape can't read tracks from this link";

/** A site's anti-bot check or rate limit: about this server, not the track. */
export const BLOCKED =
	/confirm you(?:'|\u2019)?re not a (?:ro)?bot|unusual traffic|HTTP Error 429|too many requests/i;
export const BLOCKED_MESSAGE =
	"The site is refusing this server right now (it suspects automated access). Try again later";

const KNOWN_ERRORS: ReadonlyArray<readonly [RegExp, string]> = [
	// With `generic` excluded, yt-dlp 2026.10.26 says "No suitable extractor".
	[/Unsupported URL|No suitable extractor/i, UNSUPPORTED_LINK],
	// The egress proxy refused a private address or an unusual port.
	[
		/Tunnel connection failed|ProxyError|Unable to connect to proxy|HTTP Error 403: Forbidden.*proxy/i,
		"This link couldn't be reached",
	],
	// Anti-bot checks and rate limits are about this server, not the track.
	// Before the sign-in rule below: the bot check also says "Use --cookies".
	[BLOCKED, BLOCKED_MESSAGE],
	[/private (?:video|track)|this track is private/i, "This track is private"],
	// We never try to get around DRM; say so plainly.
	[
		/DRM protected|is DRM|drm-protected/i,
		"This track is copy-protected (DRM) and can't be converted",
	],
	[
		/sign in to confirm your age|age-restricted/i,
		"This track is age-restricted",
	],
	[
		/members-only|join this channel|subscriber.?only|requires (?:a )?(?:subscription|purchase)|purchase required|login required|account (?:is )?required|--cookies/i,
		"This track is only available to signed-in, paying or subscribed users",
	],
	[
		/not available in your country|geo.?restrict|not available in your region/i,
		"This track isn't available in our region",
	],
	[/copyright/i, "This track was removed for copyright reasons"],
	[
		/(?:video|track) (?:is )?unavailable|no longer available|has been removed|does not exist|HTTP Error 404/i,
		"This track is unavailable",
	],
	[/premieres in|live event will begin/i, "This track hasn't premiered yet"],
	[
		/requested format is not available/i,
		"This track is only offered in a format TagTape can't stream",
	],
	[
		/live stream recording is not available/i,
		"This live stream's recording isn't available",
	],
];

/** yt-dlp's last `ERROR:` line: the one that explains why it stopped. */
export function lastError(stderr: string): string {
	const errorLines = stderr
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("ERROR:"));
	return errorLines.at(-1) ?? "";
}

/** True when yt-dlp's stderr says the site refused us (bot check, rate limit). */
export function isBlockedStderr(stderr: string): boolean {
	return BLOCKED.test(lastError(stderr));
}

/**
 * Pauses per site, keyed by host (lower-cased, without a leading `www.` or
 * `m.`). Approximate on purpose: a site's short-link domain counts apart.
 */
export function siteKey(url: string): string {
	return new URL(url).hostname.toLowerCase().replace(/^(?:www|m)\./, "");
}

/** Turns yt-dlp's stderr into a short message that's safe to show users. */
export function describeYtDlpFailure(stderr: string): string {
	const last = lastError(stderr);
	for (const [pattern, message] of KNOWN_ERRORS) {
		if (pattern.test(last)) return message;
	}
	return "The site refused to provide this track";
}

/** What a paused site's links answer until the pause ends. */
export function pausedMessage(msLeft: number): string {
	const minutes = Math.max(1, Math.ceil(msLeft / 60_000));
	return `The site is refusing this server right now (it suspects automated access). Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}`;
}
