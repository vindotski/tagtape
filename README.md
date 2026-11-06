# TagTape
> Convert YouTube to MP3 with metadata for standard MP3 players.

[![CI](https://github.com/vindotski/tagtape/actions/workflows/ci.yml/badge.svg)](https://github.com/vindotski/tagtape/actions/workflows/ci.yml)

![TagTape: album details on the left, up to 10 reorderable YouTube tracks on the right](docs/screenshot.png)

Paste up to 10 YouTube links, add the album title, artist, year, genre and a cover image, and download a ZIP of MP3s with every tag filled in and the tracks numbered in your order. The albums show up properly on any plain MP3 player.

Built with [TanStack Start](https://tanstack.com/start), with a Fastify service running [yt-dlp](https://github.com/yt-dlp/yt-dlp) and ffmpeg. Version 1 was a 2020 Symfony/PHP app called Albumie; its code is preserved at the [`v1.0.0`](https://github.com/vindotski/tagtape/tree/v1.0.0) tag.

[tagtape.app](https://tagtape.app)

## Run it

**Hosting it for real?** See [docs/deploy.md](docs/deploy.md): one Linux server on any cloud-init provider (DigitalOcean, Hetzner, Vultr, Linode, AWS, …), Caddy for HTTPS, and one-click deploys from GitHub Actions.

The web app and the API ship together as **one image, with one version**:

```bash
docker run --rm -p 3000:3000 vindotski/tagtape
# → http://localhost:3000
```

There's nothing to configure. Inside the container, [`docker/start.mjs`](docker/start.mjs) starts the API on `127.0.0.1:4000` (not exposed) and the web app on `:3000`, with a fresh internal token each time. If either process dies, the container stops, so your orchestrator restarts both together. The image is published for linux/amd64 and linux/arm64, with provenance and an SBOM attached.

| Tag | Published from |
|---|---|
| `latest` | every push to `main` |
| `2.0.0`, `2.0`, `2` | the git tag `v2.0.0` |
| `sha-abc1234` | every publish (immutable; use it to pin a deployment) |

The running version shows in the web app's footer, and the internal API reports it on `/health`. Builds from `main` carry build metadata, e.g. `2.0.0+main.abc1234`. To build the image yourself, run `docker build -t tagtape .`

### Releasing

The web app and the API share **one version**, which lives in the root `package.json`. See [CHANGELOG.md](CHANGELOG.md).

1. Bump `"version"` in the root `package.json` and add a `CHANGELOG.md` entry, then commit.
2. Once that commit is on `main`, run `git tag vX.Y.Z && git push origin vX.Y.Z`. CI refuses a tag that doesn't match `package.json`, and then publishes `X.Y.Z`, `X.Y`, `X` and `latest`.

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

Released into the public domain under the [Unlicense](LICENSE): do whatever you like with it.

That covers TagTape's own code. Third-party software keeps its own license: the Docker image bundles ffmpeg (LGPL/GPL), yt-dlp (Unlicense) and Node.js (MIT).

[https://github.com/vindotski/tagtape](https://github.com/vindotski/tagtape)
