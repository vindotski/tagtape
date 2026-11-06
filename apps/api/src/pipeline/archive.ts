import { PassThrough, type Readable } from "node:stream";
import yazl from "yazl";

export interface StreamedEntry {
	/** Name inside the ZIP. */
	name: string;
	/**
	 * Opens the entry's content. Called only when the ZIP reaches this entry, so
	 * just one track's processes run at a time (and none for entries after a
	 * failure).
	 */
	open: () => Readable;
}

/**
 * A ZIP written as it's read, entries **stored** (not deflated: MP3 and JPEG
 * are already compressed) with sizes in data descriptors, so no length is
 * known up front and nothing is buffered on disk.
 *
 * If an entry's stream fails, the returned stream is destroyed with that error:
 * the client sees a broken download, never a ZIP that looks complete.
 */
export function streamZip(entries: readonly StreamedEntry[]): Readable {
	const zip = new yazl.ZipFile();
	const out = new PassThrough();
	const fail = (error: Error) => {
		if (!out.destroyed) out.destroy(error);
	};

	for (const entry of entries) {
		zip.addReadStreamLazy(entry.name, { compress: false }, (callback) => {
			if (out.destroyed) {
				callback(new Error("Download stopped"), undefined as never);
				return;
			}
			const content = entry.open();
			content.once("error", fail);
			callback(null, content);
		});
	}
	zip.end();
	zip.outputStream.once("error", fail);
	zip.outputStream.pipe(out);
	return out;
}
