// Packaging: one installer per platform, built on that platform (see
// .github/workflows/ci.yml). Unsigned for now: macOS gets an ad-hoc signature
// (Apple Silicon refuses to run unsigned code), Windows and Linux none.
import { readFileSync } from "node:fs";

// One version for everything: the root package.json.
const { version } = JSON.parse(
	readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
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
	// Fixed names, without the version, so the website can link to the latest
	// release's files (apps/website/src/site.ts lists the same names).
	// biome-ignore lint/suspicious/noTemplateCurlyInString: electron-builder fills these in
	artifactName: "TagTape-${os}-${arch}.${ext}",
	// The app updates by downloading a new installer: nothing to publish to.
	publish: null,

	// Shared albums: .tagtape files and tagtape:// links open the app
	// (the same names as SHARE_EXTENSION and SHARE_SCHEME in @tagtape/shared).
	fileAssociations: [
		{
			ext: "tagtape",
			name: "TagTape Album",
			description: "TagTape album",
			mimeType: "application/x-tagtape+json",
			role: "Editor",
		},
	],
	protocols: [{ name: "TagTape album link", schemes: ["tagtape"] }],

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
		artifactName: "TagTape-win-x64.exe",
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
	// Linux tools name the same architecture differently (x86_64, amd64).
	appImage: { artifactName: "TagTape-linux-x64.AppImage" },
	deb: { artifactName: "TagTape-linux-x64.deb" },
};
