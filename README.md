# TagTape
> Turn track links into a tagged MP3 album for standard MP3 players.

[![CI](https://github.com/vindotski/tagtape/actions/workflows/ci.yml/badge.svg)](https://github.com/vindotski/tagtape/actions/workflows/ci.yml)

![TagTape: album details on the left, up to 10 reorderable track links on the right](docs/screenshot.png)

Paste up to 10 track links (one track each, up to 2 hours long), add the album title, artist, year, genre and a cover image, and download a ZIP of MP3s with every tag filled in and the tracks numbered in your order. The albums show up properly on any plain MP3 player.

**No music is stored on the server:** tracks convert while the ZIP streams to your browser. TagTape remembers each album as you typed it (details, track titles and links, the cover's link) so you can open it from "Your albums" and make it again, under a guest account with no sign-up. Albums can be deleted.

TagTape reads **direct links to MP3 files** and, through [yt-dlp](https://github.com/yt-dlp/yt-dlp), **single tracks from any site yt-dlp supports**. More kinds of links can be added with [source plugins](#sources-and-plugins).

Built with [TanStack Start](https://tanstack.com/start), with a Fastify service running ffmpeg. Version 1 was a 2020 Symfony/PHP app called Albumie; its code is preserved at the [`v1.0.0`](https://github.com/vindotski/tagtape/tree/v1.0.0) tag.

[tagtape.app](https://tagtape.app)

## Run it

**Hosting it for real?** tagtape.app runs on [Spotcraft](https://spotcraft.dev), which provides HTTPS, the Postgres database and health-checked deploys from its dashboard. See [docs/deploy.md](docs/deploy.md).

The web app and the API ship together as **one image, with one version**:

```bash
pnpm docker   # the image with a local Postgres, run the way Spotcraft runs it
# → http://localhost:3000
```

The image needs a Postgres database for guest accounts and album history (`DATABASE_URL`, `AUTH_SECRET`, `PUBLIC_URL`; see [Configuration](#configuration)). Without one, pages still render, but albums can't be started. Inside the container, [`docker/start.mjs`](docker/start.mjs) starts the API on `127.0.0.1:4000` (not exposed) and the web app on `:3000`, with a fresh internal token each time. If either process dies, the container stops, so your orchestrator restarts both together. The image is published for linux/amd64 and linux/arm64, with provenance and an SBOM attached.

| Tag | Published from |
|---|---|
| `latest` | every push to `main` |
| `3.2.0`, `3.2`, `3` | the git tag `v3.2.0` |
| `sha-abc1234` | every publish (immutable; use it to pin a deployment) |

The running version shows in the web app's footer, and the internal API reports it on `/health`. Builds from `main` carry build metadata, e.g. `3.2.0+main.abc1234`. To build the image yourself, run `docker build -t tagtape .`

### Releasing

The web app and the API share **one version**, which lives in the root `package.json`. See [CHANGELOG.md](CHANGELOG.md).

1. Bump `"version"` in the root `package.json` and add a `CHANGELOG.md` entry, then commit.
2. Once that commit is on `main`, run `git tag vX.Y.Z && git push origin vX.Y.Z`. CI refuses a tag that doesn't match `package.json`, and then publishes `X.Y.Z`, `X.Y` and `X` (`latest` comes from the push to `main`).

### Configuration

| Variable | Default | |
|---|---|---|
| `DATABASE_URL` | none | Postgres for guest accounts and album history. Spotcraft sets it when the app has a database. |
| `AUTH_SECRET` | none | Signs the guests' session cookies; 32+ characters (`openssl rand -hex 32`). Changing it signs every guest out. |
| `PUBLIC_URL` | none | The site's address, e.g. `https://tagtape.app` (http only on localhost). |
| `PORT` | `3000` | Public port of the web app. |
| `JOB_TTL_MIN`, `MAX_ACTIVE_STREAMS`, `MAX_QUEUED_STREAMS`, `MAX_ACTIVE_PROBES`, `MAX_QUEUED_JOBS`, `TRACK_CONCURRENCY`, `MAX_DIRECT_MB`, `MAX_DOWNLOADS_PER_JOB`, `MAX_STORED_JOBS`, `CHECK_TIMEOUT_SEC`, `MAX_JOBS_PER_CLIENT_HOUR`, `MAX_CHECKING_JOBS_PER_CLIENT`, `MAX_DOWNLOADS_PER_CLIENT`, `LOG_LEVEL` | see [apps/api/.env.example](apps/api/.env.example) | API tuning. These are passed through. |
| `YTDLP_BIN` | `/opt/yt-dlp/yt-dlp` | yt-dlp for links from sites; empty turns that source off. Tuning: `YTDLP_MAX_CHECKS` (3 checks at once, ~100 MB each), `YTDLP_TIMEOUT_SEC` (1800), `YTDLP_JS_RUNTIME` (`node`), `YTDLP_BLOCK_COOLDOWN_SEC` (600: how long a site that refused the server is left alone; 0 never). |
| `TRUST_PROXY` | off | Set to `1` **only** behind a reverse proxy that sets `X-Forwarded-For` (Spotcraft's Caddy does): per-client limits then use the browser's address. Without a proxy, leave it off, or anyone could pick their address. |
| `POW_COST` | `2000` | Difficulty of the invisible proof-of-work a browser solves before starting an album. |
| `API_HOST`, `API_TOKEN` | `127.0.0.1`, random | Set both only to expose the API on purpose, e.g. for the end-to-end test. |

## Development

pnpm monorepo. Requires Node 26+ and pnpm 12.

| Path | What |
|---|---|
| `apps/web` | TanStack Start web app |
| `apps/api` | Fastify service: sources, ffmpeg, tagging, zipping ([README](apps/api/README.md)) |
| `packages/shared` | zod schemas and types shared by web and API |

### Running it locally

Everything runs in Docker: you only need Docker and pnpm (to run the scripts). Nothing else is installed on your machine.

```bash
pnpm docker        # the real image, Spotcraft's restrictions, local Postgres → http://localhost:3000
pnpm docker:dev    # hot reload: web + API in containers, source mounted (Ctrl+C, then pnpm docker:down)
pnpm docker:test   # Biome, typecheck and tests (with Postgres), inside the dev container
```

Use `PORT=3010 pnpm docker:dev` (or `pnpm docker`) when port 3000 is taken. `docker:dev` also runs a local Postgres for guest accounts (not published) and migrates it before the web app starts. It keeps dependencies in Docker volumes, so the first start installs them and later starts are quick; `pnpm docker:down -v` resets them. To load a source plugin in dev, layer your own compose file on [`compose.dev.yaml`](compose.dev.yaml) that mounts it and sets `TAGTAPE_PLUGINS` on the `api` service.

Running outside Docker also works (`pnpm install`, ffmpeg on `PATH`, `.env` files from the `.env.example`s, `pnpm dev`), plus the usual scripts:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm check      # Biome lint + format (pnpm fix to apply)
```

Web routes live in `apps/web/src/routes`. TanStack Router regenerates `routeTree.gen.ts` automatically.

## Sources and plugins

A **source** turns one kind of link into MP3 audio: it claims links (`match`), checks a track (`probe`) and streams it (`stream`). TagTape does everything else: limits, the cover, the ID3 tags, the streamed ZIP and the queue. Sources are tried in order: plugins, then the two built-in ones:

- **MP3 links:** http(s) links whose path ends in `.mp3`.
- **Sites supported by yt-dlp:** any other public link, if one of yt-dlp's extractors claims it (checked when the album is checked). The image bundles yt-dlp (`YTDLP_BIN`; empty disables it). TagTape never uses yt-dlp's `generic` extractor, so it doesn't read arbitrary web pages; all of yt-dlp's traffic goes through a local proxy that refuses private network addresses; playlists, logins and DRM-protected media are refused.

More sources come from **plugins**: ES modules (TypeScript works, thanks to Node's type stripping) listed in `TAGTAPE_PLUGINS`, comma-separated. To use one, build your own image on top of TagTape's:

```dockerfile
FROM vindotski/tagtape:2
COPY --chown=node:node my-plugin/ /app/plugins/my-plugin/
ENV TAGTAPE_PLUGINS=/app/plugins/my-plugin/index.ts
```

The contract, with every rule a plugin must follow (strict link matching, no shell, nothing written to disk), is in [`apps/api/src/plugins/api.ts`](apps/api/src/plugins/api.ts). It depends only on Node's types, so a plugin can copy it for type checking. Plugins get TagTape's helpers (the no-shell process runner, the error types, ffmpeg's path) through a context object. You're responsible for the plugins you run, and for the terms of the sites TagTape reads from (built in or through plugins).

## Meta

[Ivan Vinski](https://www.vin.ski) – ivan@vin.ski

Released into the public domain under [the Unlicense](LICENSE).

That covers TagTape's own code. Third-party software keeps its own license: the Docker image bundles ffmpeg (LGPL/GPL), Node.js (MIT) and yt-dlp (Unlicense, with bundled libraries under their own licenses).

[https://github.com/vindotski/tagtape](https://github.com/vindotski/tagtape)
