# @tagtape/api

The Fastify service that turns track links into a ZIP of tagged MP3s, using ffmpeg. It reads direct links to MP3 files and, through yt-dlp, single tracks from any site yt-dlp supports; source plugins can add more. **Nothing is stored:** tracks convert *while* the ZIP streams to the browser. The TagTape web app is its only client. It calls the API from server functions with a bearer token, and proxies the download as `/download/:id`.

## Endpoints

| Method | Path | Auth | |
|---|---|---|---|
| POST | `/jobs` | Bearer | Body: `AlbumInput` from `@tagtape/shared`. Returns `202 { jobId }`; `400` with `issues` for invalid input, including links no loaded source handles (`/tracks/N/url`); `429` when the check queue is full. |
| GET | `/jobs/:id` | Bearer | `JobSnapshot`: status (`queued → probing → ready → streaming → done`, or `failed`), per-track status and errors, and `downloadReady`. Poll it. |
| GET | `/jobs/:id/archive` | public | **The download is the conversion.** Streams the ZIP as tracks convert (no `content-length`). `404` if the job is unknown or not checked yet, `409` if this album is already downloading, `410` once it was downloaded `MAX_DOWNLOADS_PER_JOB` times, `429` if downloads are full. Can be repeated (it converts again) until `JOB_TTL_MIN` after the check. |
| GET | `/sources` | Bearer | `{ sources: [{ id, name }] }`: the loaded sources, in matching order. The web app shows their names. |
| GET | `/health` | public | Checks that ffmpeg and every source's tools (yt-dlp included) run; reports the image `version` and `versions`. Returns `503` if they don't. |

## Sources and plugins

Where tracks come from is pluggable. A **source** claims links (`match`), reads a track's details (`probe`) and streams it as untagged MP3 (`stream`); the core does everything else (limits, cover, tags, the ZIP, the queue). Sources come from plugin modules listed in `TAGTAPE_PLUGINS` (comma-separated paths), loaded at startup: an invalid plugin stops the API from starting. The contract, with every rule a plugin must follow, is in [`src/plugins/api.ts`](src/plugins/api.ts).

Two sources are built in and tried after the plugins' sources, in this order. The first is **direct links to MP3 files** ([`src/sources/direct.ts`](src/sources/direct.ts)), for http(s) links whose path ends in `.mp3`:
- The check reads only the ID3 tag and a few KB after it ([`src/sources/mp3.ts`](src/sources/mp3.ts)): enough to prove it's MPEG audio and to get the length from the Xing/Info or VBRI header, or from size ÷ bitrate.
- The download goes through ffmpeg with `-f mp3` (anything else fails) and no tags. CBR files are copied; VBR files are re-encoded to 256 kbps CBR, because a streamed file can't carry a correct VBR header.
- Requests go through `lib/http.ts`: public addresses only (checked for IP literals too, on every redirect), a fresh connection each time, a 30 s connect timeout and the `MAX_DIRECT_MB` cap. A connection that drops mid-file fails the track instead of passing it as complete.

The second is **sites supported by yt-dlp** ([`src/sources/ytdlp.ts`](src/sources/ytdlp.ts)), on when `YTDLP_BIN` is set (the image sets it). It claims any other public link (no IP literals, no single-label or `.localhost`/`.local`/`.internal` hosts), and yt-dlp decides at the check:
- **Every extractor except `generic`** (`--use-extractors default,-generic`): links no extractor claims fail the check with "TagTape can't read tracks from this link", and arbitrary pages are never read.
- **Check:** `yt-dlp --dump-single-json --no-playlist --flat-playlist`. Playlists and sets are refused; so are live streams, tracks of unknown length, and anything behind DRM, a login or a paywall (no cookies are ever used).
- **Download:** `yt-dlp --load-info-json - -o -` (the check's JSON on stdin, so no second metadata fetch) piped into ffmpeg: MP3 audio is copied, anything else re-encoded to 256 kbps CBR, never DASH (it would need temporary files). HLS goes through ffmpeg.
- **Egress proxy** ([`src/lib/egress-proxy.ts`](src/lib/egress-proxy.ts)): yt-dlp fetches links itself, so the API starts a forward proxy on a random `127.0.0.1` port and gives it to yt-dlp (`--proxy`, which yt-dlp hands on to its ffmpeg). Every connection, redirects and CDN hosts included, must resolve to a public address on port 80 or 443.
- **Costs:** at most `YTDLP_MAX_CHECKS` yt-dlp checks plus one yt-dlp per active download (`MAX_ACTIVE_STREAMS`), ~100 MB each, each killed after `YTDLP_TIMEOUT_SEC`. The image uses yt-dlp's onedir release, which never unpacks to `/tmp`; `--no-cache-dir` keeps it off the disk.

## How a job runs

1. **Check (on `POST /jobs`):**
   - each track is probed by the source that claimed its link; whatever the source needs later stays **in memory**
   - a track fails the check if it's longer than 2 hours, live, of unknown length, or the source refuses it (with a reason per track)
   - the cover is downloaded (5 MB cap, private-network addresses blocked to prevent SSRF) and centre-cropped to a 1000×1000 JPEG, also in memory
   - the job becomes `ready`
2. **Download (`GET /jobs/:id/archive`):** a ZIP (stored entries, data descriptors) streams to the client. For each track, **one at a time**:
   - write our **ID3v2.3 tag** first: title, artist, album artist, album, track `n/total`, year, genre, front cover
   - then the source's untagged MP3 stream (for direct links: the file through `ffmpeg`, CBR copied, VBR re-encoded to **256 kbps CBR**)
3. **The client leaving** kills that track's process groups, and the job goes back to `ready`.
4. **A track failing** cuts the response off (the browser shows a failed download, never a complete-looking ZIP) and the job records `Track N failed: …`.

**Why the flags:**
- **CBR, and no Xing header** (`-write_xing 0`): a VBR header would have to be rewritten at the end of the file, which a stream can't do.
- **ffmpeg writes no tags** (`-id3v2_version 0 -write_id3v1 0`): ours is the only one.

Jobs live in memory (metadata and cover only), and a sweeper forgets them `JOB_TTL_MIN` minutes after their check; downloading doesn't extend that.

**Per client** (the `x-tagtape-client` header from the web app: the browser's address, IPv6 per /64; missing = one shared "local" client), each with a `429` and a clear message:
- `MAX_JOBS_PER_CLIENT_HOUR` albums started per hour
- `MAX_CHECKING_JOBS_PER_CLIENT` being checked at once
- `MAX_DOWNLOADS_PER_CLIENT` downloads running or waiting

**What one job can cost** is bounded:
- **Check:** `CHECK_TIMEOUT_SEC` for the whole check. Direct links read only the tag header and a few KB; the tag is skipped, not buffered, up to 8 MB.
- **Downloads:** at most `MAX_DOWNLOADS_PER_JOB` of them; ffmpeg runs one thread, reads only stdin (`-protocol_whitelist pipe`), stops at 2 hours (`-t`), and its output is capped.
- **Covers:** JPEG, PNG or WebP only, at most 40 megapixels (checked from the header before decoding), one decode at a time.
- **Memory:** at most `MAX_STORED_JOBS` jobs exist at once.
- **Waiting:** a download that gives up while queued leaves the queue at once.
- **URLs:** every fetched URL, redirects included, must use the standard port and no credentials.
- **Logs and secrets:** request logs mask job ids, and child processes get a minimal environment without `API_TOKEN`. Binaries are always spawned with an argument array, never through a shell, each in its own process group so cancelling also kills any children they started.

## Development

The service runs on Node 26+ native TypeScript type stripping, with no build step. It needs `ffmpeg` on `PATH`, and yt-dlp for the site source (`YTDLP_BIN`; `pnpm docker:dev` has both):

```bash
brew install ffmpeg
cp .env.example .env          # then set API_TOKEN (openssl rand -hex 32)
pnpm --filter @tagtape/api dev   # http://127.0.0.1:4000, restarts on change
pnpm --filter @tagtape/api test
```

All configuration comes from environment variables; see [.env.example](.env.example).

## Docker

The API ships inside the single TagTape image (web app + API, one version), built from the repo root's [`Dockerfile`](../../Dockerfile). There, it listens on `127.0.0.1:4000`, and only the web app reaches it. See the root [README](../../README.md#run-it) for tags and settings.

The image bundles Node 26, ffmpeg (Debian) and yt-dlp (`/opt/yt-dlp`, pinned in `docker/yt-dlp.version`). It runs as the non-root `node` user, with `tini` as PID 1. To add sources, build an image `FROM` it that copies plugin modules in and sets `TAGTAPE_PLUGINS`.

## End-to-end test

`src/e2e.test.ts` runs against a running API with the real binaries, and is skipped unless `TAGTAPE_E2E_URL` is set. It streams an album of two public, freely licensed MP3 files (CBR, so copied). It checks that our tag is the only one, the constant bitrate, that there's no Xing header, the durations, the 1000×1000 cover and the ZIP names:

```bash
TOKEN=$(openssl rand -hex 32)
docker build -t tagtape .
# API_HOST + a known token expose the otherwise-internal API for the test
docker run -d --name tagtape-e2e -p 127.0.0.1:4100:4000 -e API_HOST=0.0.0.0 -e API_TOKEN=$TOKEN tagtape
TAGTAPE_E2E_URL=http://127.0.0.1:4100 TAGTAPE_E2E_TOKEN=$TOKEN \
  pnpm --filter @tagtape/api exec vitest run src/e2e.test.ts
docker rm -f tagtape-e2e
```
