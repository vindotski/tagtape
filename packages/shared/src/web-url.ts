/**
 * Parses what a person pasted into a URL we're willing to look at: http(s)
 * only, no credentials, no custom port. A missing scheme is tolerated
 * (people paste `example.com/song.mp3`). Returns `null` for anything else.
 */
export function parseWebUrl(input: string): URL | null {
	const trimmed = input.trim();
	if (trimmed === "") return null;

	let url: URL;
	try {
		url = new URL(
			/^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`,
		);
	} catch {
		return null;
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") return null;
	if (url.username || url.password || url.port) return null;
	return url;
}
