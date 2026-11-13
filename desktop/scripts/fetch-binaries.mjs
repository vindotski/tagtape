#!/usr/bin/env node
// Fetches the pinned ffmpeg and yt-dlp for one platform into
// desktop/resources/bin/<platform>-<arch>/ (git-ignored). Every download is
// checked against the SHA-256 in binaries.lock.json before it's unpacked.
// Nothing is installed system-wide.
//
//   node desktop/scripts/fetch-binaries.mjs [--platform darwin|win32|linux] [--arch arm64|x64] [--force]
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
	chmodSync,
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = join(dirname(fileURLToPath(import.meta.url)), "..");
const lock = JSON.parse(
	readFileSync(join(desktop, "binaries.lock.json"), "utf8"),
);

function option(name, fallback) {
	const index = process.argv.indexOf(`--${name}`);
	return index > 0 ? process.argv[index + 1] : fallback;
}
const platform = option("platform", process.platform);
const arch = option("arch", process.arch);
const force = process.argv.includes("--force");
const target = `${platform}-${arch}`;
const out = join(desktop, "resources", "bin", target);
const exe = platform === "win32" ? ".exe" : "";

/** Runs a program with an argument array (never a shell). */
function run(command, args) {
	const result = spawnSync(command, args, { stdio: "inherit", shell: false });
	if (result.status !== 0) {
		throw new Error(`${command} ${args.join(" ")} failed`);
	}
}

/**
 * Unpacks into `to`.
 * - Windows: the system's own tar (bsdtar, reads zips). By full path, because
 *   a Git Bash shell puts GNU tar first, which can't read zips and takes
 *   `C:\\…` for a remote host.
 * - macOS: tar is bsdtar too.
 * - Linux: GNU tar for tarballs, unzip for zips.
 */
function unpack(archive, to) {
	mkdirSync(to, { recursive: true });
	if (process.platform === "win32") {
		const tar = join(
			process.env.SystemRoot ?? "C:\\Windows",
			"System32",
			"tar.exe",
		);
		run(tar, ["-xf", archive, "-C", to]);
	} else if (archive.endsWith(".zip") && process.platform === "linux") {
		run("unzip", ["-q", "-o", archive, "-d", to]);
	} else {
		run("tar", ["-xf", archive, "-C", to]);
	}
}

async function download(url, sha256, to) {
	console.log(`  ${url}`);
	const response = await fetch(url, { redirect: "follow" });
	if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	const actual = createHash("sha256").update(bytes).digest("hex");
	if (actual !== sha256) {
		throw new Error(`${url}: SHA-256 is ${actual}, expected ${sha256}`);
	}
	writeFileSync(to, bytes);
}

/** A stamp of what's installed, so an unchanged lock file fetches nothing. */
const stampFile = join(out, "versions.json");
const wanted = {
	"yt-dlp": lock["yt-dlp"].targets[target],
	ffmpeg: lock.ffmpeg.targets[target],
};
if (!wanted["yt-dlp"] || !wanted.ffmpeg) {
	throw new Error(`No pinned binaries for ${target} in binaries.lock.json`);
}
const stamp = JSON.stringify(
	{ "yt-dlp": wanted["yt-dlp"].sha256, ffmpeg: wanted.ffmpeg.sha256 },
	null,
	"\t",
);
if (
	!force &&
	existsSync(stampFile) &&
	readFileSync(stampFile, "utf8") === stamp
) {
	console.log(`Binaries for ${target} are up to date.`);
	process.exit(0);
}

const work = mkdtempSync(join(tmpdir(), "tagtape-binaries-"));
try {
	rmSync(out, { recursive: true, force: true });
	mkdirSync(out, { recursive: true });

	console.log(`ffmpeg ${wanted.ffmpeg.version} for ${target}`);
	const ffmpegArchive = join(
		work,
		basename(new URL(wanted.ffmpeg.url).pathname),
	);
	await download(wanted.ffmpeg.url, wanted.ffmpeg.sha256, ffmpegArchive);
	unpack(ffmpegArchive, join(work, "ffmpeg"));
	const ffmpeg = join(out, `ffmpeg${exe}`);
	renameSync(join(work, "ffmpeg", wanted.ffmpeg.executable), ffmpeg);
	if (!exe) chmodSync(ffmpeg, 0o755);
	const notice = [
		`ffmpeg ${wanted.ffmpeg.version}`,
		`Licence: ${wanted.ffmpeg.license}`,
		`Build and sources: ${wanted.ffmpeg.source}`,
		`Downloaded from: ${wanted.ffmpeg.url}`,
		"FFmpeg's own source: https://ffmpeg.org/download.html",
		"",
	].join("\n");
	writeFileSync(join(out, "ffmpeg.NOTICE.txt"), notice);
	// The licence text ships next to the program: from the archive when it
	// has one, otherwise FFmpeg's own copy for that release.
	if (wanted.ffmpeg.licenseFile) {
		renameSync(
			join(work, "ffmpeg", wanted.ffmpeg.licenseFile),
			join(out, "ffmpeg.LICENSE.txt"),
		);
	} else {
		await download(
			wanted.ffmpeg.licenseUrl,
			wanted.ffmpeg.licenseSha256,
			join(out, "ffmpeg.LICENSE.txt"),
		);
	}
	writeFileSync(
		join(out, "yt-dlp.NOTICE.txt"),
		[
			`yt-dlp ${lock["yt-dlp"].version}`,
			`Licence: ${lock["yt-dlp"].license} (its bundled components carry their own; see yt-dlp/_internal)`,
			`Source: ${lock["yt-dlp"].source}`,
			"",
		].join("\n"),
	);

	// yt-dlp's "onedir" build: an executable next to its _internal folder. (The
	// single-file build unpacks itself into the temp folder on every run.)
	console.log(`yt-dlp ${lock["yt-dlp"].version} for ${target}`);
	const ytdlpArchive = join(work, "yt-dlp.zip");
	await download(wanted["yt-dlp"].url, wanted["yt-dlp"].sha256, ytdlpArchive);
	unpack(ytdlpArchive, join(work, "yt-dlp"));
	cpSync(join(work, "yt-dlp"), join(out, "yt-dlp"), { recursive: true });
	const ytdlp = join(out, "yt-dlp", `yt-dlp${exe}`);
	renameSync(join(out, "yt-dlp", wanted["yt-dlp"].executable), ytdlp);
	if (!exe) chmodSync(ytdlp, 0o755);

	writeFileSync(stampFile, stamp);
	console.log(`Ready in ${out}`);
} finally {
	rmSync(work, { recursive: true, force: true });
}
