# @tagtape/api

The Fastify service that turns YouTube links into a ZIP of tagged MP3s. It runs yt-dlp and ffmpeg as background jobs. The TagTape web app is its only client: it calls the API from server functions, sending a bearer token. Browsers only hit the ZIP download route directly.

## Endpoints

| Method | Path | Auth | |
|---|---|---|---|
| POST | `/jobs` | Bearer | Body: `AlbumInput` from `@tagtape/shared`. Returns `202 { jobId }`; `400` with `issues` for invalid input; `429` when the queue is full. |
| GET | `/jobs/:id` | Bearer | `JobSnapshot`: job status, per-track status and errors, and `archiveReady`. Poll it until the status is `done` or `failed`. |
| GET | `/jobs/:id/archive` | public | Streams the ZIP. The job ID is the download key; the link expires after `JOB_TTL_MIN`. |
| GET | `/health` | public | Checks that yt-dlp and ffmpeg run. Returns `503` if they don't. |

## How a job runs

1. **Probe:** one `yt-dlp --dump-single-json` per track. The job fails before anything is downloaded if a track is longer than 10 minutes, live, or unavailable.
2. **Cover:** download the cover image (5 MB cap; private-network addresses are blocked to prevent SSRF), then centre-crop it to a 1000×1000 JPEG.
3. **Tracks:** download with `--load-info-json`, reusing the probe's data so nothing is fetched twice. Convert to MP3 (best VBR), then write ID3v2.3 tags: title, artist, album artist, album, track `n/total`, year, genre, front cover.
4. **ZIP:** pack the tracks uncompressed, named `01 - Title.mp3`, and keep only the ZIP on disk.

Jobs live in memory, and a sweeper deletes each job and its files `JOB_TTL_MIN` minutes after it finishes. Binaries are always spawned with an argument array, never through a shell.

## Development

The service runs on Node 24+ native TypeScript type stripping, with no build step. It needs `yt-dlp` and `ffmpeg` on `PATH`:

```bash
brew install yt-dlp ffmpeg
cp .env.example .env          # then set API_TOKEN (openssl rand -hex 32)
pnpm --filter @tagtape/api dev   # http://127.0.0.1:4000, restarts on change
pnpm --filter @tagtape/api test
```

All configuration comes from environment variables; see [.env.example](.env.example).
