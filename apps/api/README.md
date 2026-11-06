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

## Docker

The image bundles Node 24, ffmpeg (Debian), and the official yt-dlp binary, checked against the release's `SHA2-256SUMS`. It runs as the non-root `node` user, with `tini` as PID 1, so signals reach Node and orphaned processes are reaped. Build it from the **repo root**, because it needs the workspace files:

```bash
docker build -f apps/api/Dockerfile -t tagtape-api .
docker run --rm -p 127.0.0.1:4000:4000 -e API_TOKEN=$(openssl rand -hex 32) tagtape-api
```

YouTube changes often, so update yt-dlp by bumping the `YTDLP_VERSION` build argument (or pass `--build-arg YTDLP_VERSION=…`) and rebuilding.

### Prebuilt image

CI publishes the image to Docker Hub as [`vindotski/tagtape`](https://hub.docker.com/r/vindotski/tagtape) for linux/amd64 and linux/arm64, with provenance and an SBOM attached. It only publishes after lint, tests and the container smoke test pass.

```bash
docker run --rm -p 127.0.0.1:4000:4000 -e API_TOKEN=$(openssl rand -hex 32) vindotski/tagtape
```

| Tag | Published from |
|---|---|
| `latest` | every push to `main` |
| `1.2.3`, `1.2`, `1` | the git tag `v1.2.3` |
| `sha-abc1234` | every publish (immutable; use it to pin a deployment) |

To cut a release, run `git tag v1.0.0 && git push origin v1.0.0`.

## End-to-end test

`src/e2e.test.ts` runs against a running API with the real binaries, and is skipped unless `TAGTAPE_E2E_URL` is set. It converts a 19-second video, and checks the tags, the 1000×1000 front cover and the ZIP file names:

```bash
TOKEN=$(openssl rand -hex 32)
docker run -d --name tagtape-e2e -p 127.0.0.1:4100:4000 -e API_TOKEN=$TOKEN tagtape-api
TAGTAPE_E2E_URL=http://127.0.0.1:4100 TAGTAPE_E2E_TOKEN=$TOKEN \
  pnpm --filter @tagtape/api exec vitest run src/e2e.test.ts
docker rm -f tagtape-e2e
```
