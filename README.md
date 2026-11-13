# TagTape
> Turn track links into a tagged MP3 album for standard MP3 players.

[![CI](https://github.com/vindotski/tagtape/actions/workflows/ci.yml/badge.svg)](https://github.com/vindotski/tagtape/actions/workflows/ci.yml)

![The TagTape window: a sidebar with New album, Library and recent albums, and the library as a shelf of six album covers](docs/screenshot.png)

TagTape is a desktop app for macOS, Windows and Linux. Paste up to 10 track links (one track each, up to 2 hours long), add the album title, artist, year, genre and a cover image, and get a folder of MP3s with every tag filled in and the tracks numbered in your order. The albums show up properly on any plain MP3 player.

**Everything happens on your computer.** There is no TagTape server and no account. Tracks are fetched over your own connection, converted, and written straight into the folder you choose. TagTape remembers each album as you typed it (details, track titles and links, the cover's link and a small copy of the cover) in its own folder on your computer, so you can open it from the library and make it again. Albums can be deleted.

**Share an album** as a small `.tagtape` file or a link. It holds the details and track links, never the music; whoever opens it makes the album on their own computer. The link carries the album inside itself, so nothing is uploaded anywhere.

TagTape reads **direct links to MP3 files** and, through [yt-dlp](https://github.com/yt-dlp/yt-dlp), **single tracks from any site yt-dlp supports**. Playlists, logins and copy-protected media are refused, and TagTape never tries to get around a site's bot checks. More kinds of links can be added with [source plugins](#sources-and-plugins).

Built with [Electron](https://www.electronjs.org), React and [TanStack Router](https://tanstack.com/router); [ffmpeg](https://ffmpeg.org) and yt-dlp come inside the app. Versions 2 and 3 were a hosted web app (its code ends at the [`v3.2.0`](https://github.com/vindotski/tagtape/tree/v3.2.0) tag), and version 1 was a 2020 Symfony/PHP app called Albumie ([`v1.0.0`](https://github.com/vindotski/tagtape/tree/v1.0.0)).

## Get it

Download the installer for your system from the [latest release](https://github.com/vindotski/tagtape/releases/latest).

The installers aren't signed with a paid developer certificate yet, so your computer asks before running the app:

- **macOS:** open the app once and dismiss the warning, then choose **Open Anyway** next to TagTape in System Settings → Privacy & Security.
- **Windows:** when "Windows protected your PC" appears, choose **More info**, then **Run anyway**.
- **Linux:** make the AppImage executable and run it, or install the `.deb`.

Each release lists SHA-256 checksums (`SHA256SUMS.txt`). To update, install the newer version over the old one; your albums are kept.

## Development

You need [Node.js](https://nodejs.org) 26 and [pnpm](https://pnpm.io). Nothing else is installed on your machine: ffmpeg and yt-dlp are downloaded into the repository, pinned and checksum-verified.

```bash
pnpm install
pnpm binaries   # fetch ffmpeg and yt-dlp for this platform
pnpm dev        # the app, with hot reload
```

| Command | What it does |
|---|---|
| `pnpm check` | Lint and format check (Biome); `pnpm fix` applies fixes |
| `pnpm typecheck` | TypeScript, in every package |
| `pnpm test` | Unit tests (no binaries or network needed) |
| `pnpm build` | Builds the app's code and the website |
| `pnpm package` | Installers for this platform, in `desktop/dist` |
| `pnpm docker:test` | Check, typecheck and test in a clean Linux container |

The repository is a pnpm workspace:

| Path | What |
|---|---|
| `desktop/` | The Electron app: main process, preload bridge, the React UI, and the pipeline that checks, converts and tags tracks (`src/core`) |
| `website/` | The product site ([Astro](https://astro.build)), published on GitHub Pages |
| `shared/` | Code every part uses: validation schemas, limits, the ID3 tag writer |

An end-to-end test converts real public links with the bundled programs:

```bash
TAGTAPE_E2E=1 pnpm --filter @tagtape/desktop exec vitest run src/core/e2e.test.ts
```

### Releasing

The version lives in the root `package.json`. Bump it, date the `## Unreleased` section in [`CHANGELOG.md`](CHANGELOG.md), merge to `main` and tag `vX.Y.Z`. CI builds the installers on macOS, Windows and Linux, starts each packaged app once as a smoke test, and attaches them to a draft GitHub Release to publish.

### Bundled programs

[`desktop/binaries.lock.json`](desktop/binaries.lock.json) pins ffmpeg and yt-dlp for each platform by URL and SHA-256. yt-dlp is its official release. ffmpeg has no official binaries, so TagTape uses [BtbN's builds](https://github.com/BtbN/FFmpeg-Builds) (LGPL) on Windows and Linux and [Martin Riedl's builds](https://ffmpeg.martin-riedl.de) (GPL) on macOS. Their licence texts ship inside the app, next to the programs.

## Sources and plugins

A **source** turns one kind of link into MP3 audio: it claims links (`match`), checks a track (`probe`) and streams it (`stream`). TagTape does everything else: limits, the cover, the ID3 tags, the album folder and the queue. Sources are tried in order: plugins, then the two built-in ones:

- **MP3 links:** http(s) links whose path ends in `.mp3`.
- **Sites supported by yt-dlp:** any other public link, if one of yt-dlp's extractors claims it (checked when the album is checked). TagTape never uses yt-dlp's `generic` extractor, so it doesn't read arbitrary web pages; all of yt-dlp's traffic goes through a local proxy that refuses private network addresses; playlists, logins and DRM-protected media are refused.

More sources come from **plugins**: JavaScript modules listed in the `TAGTAPE_PLUGINS` environment variable (absolute paths, comma-separated) when the app starts.

The contract, with every rule a plugin must follow (strict link matching, no shell, nothing written to disk), is in [`desktop/src/core/plugins/api.ts`](desktop/src/core/plugins/api.ts). It depends only on Node's types, so a plugin can copy it for type checking. Plugins get TagTape's helpers (the no-shell process runner, the error types, ffmpeg's path) through a context object. You're responsible for the plugins you run, and for the terms of the sites TagTape reads from (built in or through plugins).

## Meta

[Ivan Vinski](https://www.vin.ski) – ivan@vin.ski

Released into the public domain under [the Unlicense](LICENSE).

That covers TagTape's own code. Third-party software keeps its own license: the app bundles Electron (MIT), ffmpeg (LGPL or GPL, depending on the platform's build) and yt-dlp (Unlicense, with bundled libraries under their own licenses).

[https://github.com/vindotski/tagtape](https://github.com/vindotski/tagtape)
