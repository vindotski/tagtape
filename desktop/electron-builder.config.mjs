// Packaging: one installer per platform, built on that platform (see
// .github/workflows/ci.yml). Unsigned for now: macOS gets an ad-hoc signature
// (Apple Silicon refuses to run unsigned code), Windows and Linux none.
import { readFileSync } from "node:fs";

// One version for everything: the root package.json.
const { version } = JSON.parse(
	readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

/** The bundled ffmpeg and yt-dlp for the platform being built (`pnpm binaries`). */
const binaries = (platform) => [
	{
		from: `resources/bin/${platform}-\${arch}`,
		to: `bin/${platform}-\${arch}`,
	},
];

/** @type {import("electron-builder").Configuration} */
export default {
	appId: "app.tagtape.desktop",
	productName: "TagTape",
	copyright: "Public domain (Unlicense)",
	extraMetadata: { version },
	directories: { output: "dist", buildResources: "build" },
	files: ["out/**", "package.json"],
	// sharp's native code can't be loaded from inside the archive.
	asarUnpack: ["**/node_modules/sharp/**", "**/node_modules/@img/**"],
	// biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder fills these in
	artifactName: "TagTape-${version}-${os}-${arch}.${ext}",
	// The app updates by downloading a new installer: nothing to publish to.
	publish: null,

	mac: {
		category: "public.app-category.music",
		target: ["dmg", "zip"],
		identity: "-",
		hardenedRuntime: false,
		// ffmpeg and yt-dlp arrive signed by their publishers: leave them as
		// they are (yt-dlp's embedded Python can't be re-signed anyway).
		signIgnore: ["/Contents/Resources/bin/"],
		extraResources: binaries("darwin"),
	},
	win: {
		target: ["nsis"],
		extraResources: binaries("win32"),
	},
	nsis: {
		oneClick: false,
		allowToChangeInstallationDirectory: true,
	},
	linux: {
		category: "AudioVideo",
		executableName: "tagtape",
		target: ["AppImage", "deb"],
		maintainer: "TagTape <noreply@tagtape.app>",
		synopsis: "Track links to a folder of tagged MP3s",
		extraResources: binaries("linux"),
	},
};
