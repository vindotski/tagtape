import { join } from "node:path";

export interface BinaryPaths {
	ffmpeg: string;
	ytdlp: string;
}

/**
 * Where `scripts/fetch-binaries.mjs` puts the bundled programs for one
 * platform, inside `root` (the repo's `apps/desktop/resources/bin` in development,
 * the app's resources when packaged).
 */
export function binaryPaths(
	root: string,
	platform: NodeJS.Platform = process.platform,
	arch: string = process.arch,
): BinaryPaths {
	const exe = platform === "win32" ? ".exe" : "";
	const dir = join(root, `${platform}-${arch}`);
	return {
		ffmpeg: join(dir, `ffmpeg${exe}`),
		ytdlp: join(dir, "yt-dlp", `yt-dlp${exe}`),
	};
}
