// File > New Album asks for an empty editor. Going to the new-album screen
// does that from anywhere else; when that screen is already open, navigating
// changes nothing, so the editor is told directly.
const listeners = new Set<() => void>();

/** Asks the open editor to start over. */
export function requestNewAlbum(): void {
	for (const listener of listeners) listener();
}

/** Calls `listener` on each request; returns the unsubscribe. */
export function onNewAlbum(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
