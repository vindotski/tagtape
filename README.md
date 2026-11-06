# TagTape
> Convert YouTube to MP3 with metadata for standard MP3 players.

[![CI](https://github.com/vindotski/tagtape/actions/workflows/ci.yml/badge.svg)](https://github.com/vindotski/tagtape/actions/workflows/ci.yml)

Paste up to 10 YouTube links, add the album title, artist, year, genre and a cover image, and download a ZIP of MP3s with every tag filled in and the tracks numbered in your order. The albums show up properly on any plain MP3 player.

Built with [TanStack Start](https://tanstack.com/start), with a Fastify service running [yt-dlp](https://github.com/yt-dlp/yt-dlp) and ffmpeg. The original 2020 Symfony/PHP version lives in [legacy/](legacy/README.md).

[tagtape.app](https://tagtape.app)

## Development

pnpm monorepo. Requires Node 24+ and pnpm 12.

| Path | What |
|---|---|
| `apps/web` | TanStack Start web app |
| `apps/api` | Fastify service: yt-dlp, ffmpeg, tagging, zipping ([README](apps/api/README.md)) |
| `packages/shared` | zod schemas and types shared by web and API |
| `legacy/` | Original Symfony app, kept for reference |

### Running it locally

The API needs yt-dlp and ffmpeg. The easiest way to get them is the API's Docker image.

```bash
pnpm install
TOKEN=$(openssl rand -hex 32)

# 1. API (Docker, with yt-dlp + ffmpeg) on :4000
docker build -f apps/api/Dockerfile -t tagtape-api .
docker run --rm -p 127.0.0.1:4000:4000 -e API_TOKEN=$TOKEN tagtape-api

# 2. Web app on :3000 (in another terminal)
printf 'API_URL=http://127.0.0.1:4000\nAPI_TOKEN=%s\n' "$TOKEN" > apps/web/.env
pnpm --filter @tagtape/web dev
```

Without Docker: `brew install yt-dlp ffmpeg`, put the same token in `apps/api/.env` (see its `.env.example`), and run `pnpm dev` to start both apps.

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
