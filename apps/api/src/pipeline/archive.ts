import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import yazl from "yazl";
import type { ArchiveEntry } from "./types.ts";

/**
 * Writes a ZIP with every entry **stored**, not deflated: MP3 and JPEG data is
 * already compressed, so deflating would only cost CPU.
 */
export async function writeArchive(input: {
	entries: ArchiveEntry[];
	outPath: string;
	signal: AbortSignal;
}): Promise<void> {
	const zip = new yazl.ZipFile();
	for (const entry of input.entries) {
		zip.addFile(entry.path, entry.name, { compress: false });
	}
	zip.end();
	await pipeline(zip.outputStream, createWriteStream(input.outPath), {
		signal: input.signal,
	});
}
