# TagTape
> Convert YouTube to MP3 with metadata for standard MP3 players.

[![CI](https://github.com/vindotski/tagtape/actions/workflows/ci.yml/badge.svg)](https://github.com/vindotski/tagtape/actions/workflows/ci.yml)

Paste up to 10 YouTube links, add the album title, artist, year, genre and a cover image, and download a ZIP of MP3s with every tag filled in and the tracks numbered in your order. The albums show up properly on any plain MP3 player.

Built with [TanStack Start](https://tanstack.com/start), with a Fastify service running [yt-dlp](https://github.com/yt-dlp/yt-dlp) and ffmpeg. The original 2020 Symfony/PHP version lives in [legacy/](legacy/README.md).

[tagtape.app](https://tagtape.app)

## Run it

The web app and the API ship together as **one image, with one version**:

```bash
docker run --rm -p 3000:3000 vindotski/tagtape
# → http://localhost:3000
```

There's nothing to configure. Inside the container, [`docker/start.mjs`](docker/start.mjs) starts the API on `127.0.0.1:4000` (not exposed) and the web app on `:3000`, with a fresh internal token each time. If either process dies, the container stops, so your orchestrator restarts both together. The image is published for linux/amd64 and linux/arm64, with provenance and an SBOM attached.

| Tag | Published from |
|---|---|
| `latest` | every push to `main` |
| `1.2.3`, `1.2`, `1` | the git tag `v1.2.3` (cut a release with `git tag v1.2.3 && git push origin v1.2.3`) |
| `sha-abc1234` | every publish (immutable; use it to pin a deployment) |

`GET /health` on the internal API reports the image's `version`. To build the image yourself, run `docker build -t tagtape .`

| Variable | Default | |
|---|---|---|
| `PORT` | `3000` | Public port of the web app. |
| `JOB_TTL_MIN`, `MAX_ACTIVE_JOBS`, `MAX_QUEUED_JOBS`, `TRACK_CONCURRENCY`, `LOG_LEVEL` | see [apps/api/.env.example](apps/api/.env.example) | API tuning. These are passed through. |
| `API_HOST`, `API_TOKEN` | `127.0.0.1`, random | Set both only to expose the API on purpose, e.g. for the end-to-end test. |

## Development

pnpm monorepo. Requires Node 24+ and pnpm 12.

| Path | What |
|---|---|
| `apps/web` | TanStack Start web app |
| `apps/api` | Fastify service: yt-dlp, ffmpeg, tagging, zipping ([README](apps/api/README.md)) |
| `packages/shared` | zod schemas and types shared by web and API |
| `legacy/` | Original Symfony app, kept for reference |

### Running it locally

The API needs yt-dlp and ffmpeg. You can install them, or borrow them from the image.

```bash
pnpm install
TOKEN=$(openssl rand -hex 32)

# Option A: install the binaries and run both apps with hot reload
brew install yt-dlp ffmpeg
printf 'API_TOKEN=%s\n' "$TOKEN" > apps/api/.env
printf 'API_URL=http://127.0.0.1:4000\nAPI_TOKEN=%s\n' "$TOKEN" > apps/web/.env
pnpm dev                                   # web :3000, API :4000

# Option B: API from the image (exposed on purpose), web app with hot reload
docker run --rm -p 127.0.0.1:4000:4000 -e API_HOST=0.0.0.0 -e API_TOKEN=$TOKEN vindotski/tagtape
printf 'API_URL=http://127.0.0.1:4000\nAPI_TOKEN=%s\n' "$TOKEN" > apps/web/.env
pnpm --filter @tagtape/web dev
```

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm check      # Biome lint + format (pnpm fix to apply)
```

Web routes live in `apps/web/src/routes`. TanStack Router regenerates `routeTree.gen.ts` automatically.

## Meta

[Ivan Vinski](https://www.vin.ski) – ivan@vin.ski

Distributed under the GPL-2.0 license. See [LICENSE](LICENSE) for more information.

[https://github.com/vindotski/tagtape](https://github.com/vindotski/tagtape)
