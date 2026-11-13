import {
	MAX_COVER_BYTES,
	MAX_TRACK_SECONDS,
	MAX_TRACKS,
} from "@tagtape/shared";

export const REPOSITORY = "https://github.com/vindotski/tagtape";

/** Installers of the latest published release, by their fixed file names. */
const latest = (file: string) =>
	`${REPOSITORY}/releases/latest/download/${file}`;

export const DOWNLOADS = [
	{
		platform: "macOS",
		note: "macOS 12 or later",
		files: [
			{ label: "Apple Silicon (.dmg)", href: latest("TagTape-mac-arm64.dmg") },
			{ label: "Intel (.dmg)", href: latest("TagTape-mac-x64.dmg") },
		],
	},
	{
		platform: "Windows",
		note: "Windows 10 or later, 64-bit",
		files: [{ label: "Installer (.exe)", href: latest("TagTape-win-x64.exe") }],
	},
	{
		platform: "Linux",
		note: "64-bit (x86)",
		files: [
			{ label: "AppImage", href: latest("TagTape-linux-x64.AppImage") },
			{
				label: "Debian / Ubuntu (.deb)",
				href: latest("TagTape-linux-x64.deb"),
			},
		],
	},
];

export const LIMITS = {
	tracks: MAX_TRACKS,
	trackLength:
		MAX_TRACK_SECONDS % 3600 === 0
			? `${MAX_TRACK_SECONDS / 3600} hour${MAX_TRACK_SECONDS === 3600 ? "" : "s"}`
			: `${Math.round(MAX_TRACK_SECONDS / 60)} minutes`,
	cover: `${Math.round(MAX_COVER_BYTES / (1024 * 1024))} MB`,
};
