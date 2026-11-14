// File > New Album asks for an empty editor. The editor lives on the first
// screen, which may not be on screen when the request comes (the window is
// showing the library, say): the request then waits for it.
const listeners = new Set<() => void>();
let waiting = false;

/** Asks the first screen's editor to start over, now or as soon as it is there. */
export function requestNewAlbum(): void {
	if (listeners.size === 0) waiting = true;
	for (const listener of listeners) listener();
}

/** Calls `listener` on each request (and for one that was waiting); returns the unsubscribe. */
export function onNewAlbum(listener: () => void): () => void {
	listeners.add(listener);
	if (waiting) {
		waiting = false;
		listener();
	}
	return () => {
		listeners.delete(listener);
	};
}
