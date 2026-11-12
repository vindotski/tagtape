# Changelog

TagTape has one version for the web app and the API, kept in the root `package.json`. Each release is a git tag `vX.Y.Z`, published as the Docker image `vindotski/tagtape:X.Y.Z`.

## Unreleased

### Added
- **Links from sites:** TagTape now reads single tracks from any site [yt-dlp](https://github.com/yt-dlp/yt-dlp) has an extractor for, built in. The image bundles yt-dlp 2026.10.26 (`YTDLP_BIN`; empty turns it off). MP3 links still go to the direct source first.
  - yt-dlp never uses its `generic` extractor, so arbitrary web pages are never read. A link no extractor claims fails the check with a clear message.
  - Playlists and sets, live streams, and anything behind DRM, a login or a paywall are refused. No cookies are used.
  - Media still never touches the disk: yt-dlp streams into ffmpeg (MP3 copied, anything else 256 kbps CBR).
- **Egress proxy:** everything yt-dlp (and its ffmpeg) fetches goes through a local proxy that allows only public addresses on ports 80 and 443, redirects and CDN hosts included.
- `YTDLP_MAX_CHECKS` (3), `YTDLP_TIMEOUT_SEC` (1800) and `YTDLP_JS_RUNTIME` (`node`).
- **Home page:** `/` now explains TagTape (how it works, what it keeps, which links work, FAQ) with a "Make an album" button.
- **Albums you can make again:** `/albums` lists your albums, and opening one (`/albums/<id>`) loads it into the editor to change it and convert it again, or to delete it.

### Changed
- **Node 26 LTS:** the image and dev container run on Node 26 (was 24), with TypeScript 7 and Biome 2.6 for development.
- **TagTape now keeps your albums in full** (details, track titles and links, the cover's link) so they can be made again; before, only the album details were kept. The music and images are still never stored. Albums saved before this open without their tracks.
- The album form moved to `/new`.
- `/new` looks like an album in a music app: edit the title, artist, genre and year in place over a cover tile, tracks are playlist rows, the conversion plays out in the same album view, and "Your albums" is a grid of album tiles.

## 3.0.0 (2026-11-08)

Guest accounts with album history, and hosting on [Spotcraft](https://spotcraft.dev).

**Breaking:** starting albums now needs a Postgres database (`DATABASE_URL`, `AUTH_SECRET`, `PUBLIC_URL`; Spotcraft provides the first), and the single-server deploy kit is gone.

### Added
- **Guest accounts** from Spotcraft's backend kit (`@spotcraft/kit` 0.2.0). Starting an album gives the visitor a guest account (an httpOnly session cookie, no sign-up). Page views never create one. It needs Postgres and `DATABASE_URL`, `AUTH_SECRET` and `PUBLIC_URL`; `pnpm docker:dev` now runs a local Postgres and migrates its `auth` schema.
- **Your albums:** the page lists the albums you've started in this browser (the newest 20; up to 50 are kept). Only the album details are stored (title, artist, genre, year, track count), never track links, covers or music. TagTape migrates its own tables on first use.

### Changed
- **Hosted on [Spotcraft](https://spotcraft.dev)** instead of the single-server deploy kit. Spotcraft provides HTTPS, the Postgres database, health-checked deploys with rollback, and the same container restrictions (now a 64 MB `/tmp`). See [docs/deploy.md](docs/deploy.md).
- The app now enforces the 64 KB request body limit itself and sets `X-Frame-Options`, `Cross-Origin-Opener-Policy` and `Permissions-Policy`, which Caddy used to add.
- The image's health check probes every 2 s while starting, so a deploy counts as up within seconds.
- `pnpm docker` runs the image the way Spotcraft does, with a local Postgres provisioned like Spotcraft's (`docker/compose.local.yaml`).

### Removed
- The deploy kit (`deploy/`: cloud-init, Compose with Caddy, `remote-deploy.sh`) and the manual **Deploy** workflow. Deploys now happen from Spotcraft's dashboard.

## 2.0.0 (2026-11-06)

A complete rewrite of Albumie as **TagTape** ([tagtape.app](https://tagtape.app)).

### Added
- Web app built with TanStack Start and **shadcn/ui** (React Aria base), with automatic dark mode and a mobile layout. You can reorder tracks by dragging (mouse, touch or keyboard) or with buttons.
- **Nothing is stored on the server:** after a quick check of every track, the download *is* the conversion. Tracks convert one after another while the ZIP streams to your browser (per-track progress on the page), and closing the tab stops the work. "Download again" converts again.
- **Direct links to MP3 files**, built in. Only the file's first few KB are read to check it's MP3 and how long it is. Constant-bitrate files are copied unchanged (old tags removed); variable-bitrate files are re-encoded to 256 kbps CBR so players show the right length. Up to 300 MB (`MAX_DIRECT_MB`).
- **Source plugins:** where tracks come from is pluggable (`TAGTAPE_PLUGINS`). A source claims links, checks tracks and streams MP3; TagTape does the limits, cover, tags and ZIP. Tracks can be up to **2 hours** long (v1: 10 minutes), so long mixes fit.
- Every track is checked **before** anything downloads. Tracks longer than 2 hours, live streams, and tracks a source can't provide are rejected with a reason per track, and the form keeps everything you typed.
- Covers are **centre-cropped** to 1000×1000 instead of stretched.
- MP3s at **256 kbps constant bitrate** (constant-bitrate MP3 sources are copied, not re-encoded), with ID3v2.3 tags for wide player support: title, artist, album artist, album, `n/total` track number, year, genre and front cover.
- **Unicode filenames** (`01 - Тест ✓.mp3`) instead of ASCII-only.
- **One Docker image** (`vindotski/tagtape`, amd64 + arm64) containing the web app and the API, with provenance and an SBOM.
- Reusable, provider-neutral **deploy config** for a single server (any cloud-init host: DigitalOcean, Hetzner, Vultr, Linode, AWS, …; Ubuntu or Debian, amd64 or arm64): cloud-init bootstrap, Docker Compose with Caddy for automatic HTTPS, and a manual GitHub Actions deploy with a pinned SSH host key, health-gated rollout and an outside check. See [docs/deploy.md](docs/deploy.md).

### Changed
- Relicensed from GPL-2.0 to **MIT**.

### Security
- Fixed **shell injection**: v1 passed the user's URL to `shell_exec`. Binaries now run with argument arrays, never through a shell (plugins get the same helpers), and a link is only accepted when a source's strict matcher claims it.
- Added **SSRF protection** for cover image URLs and MP3 links: private, loopback and link-local addresses are blocked on every redirect hop, including IP-literal hosts such as `http://169.254.169.254/` (Node skips DNS lookups for those), with a fresh connection per request, a size cap and a timeout.
- The API is internal to the container. The web app talks to it with a per-start random token.
- **Bounded cost per job:**
  - a time limit for the whole check
  - at most 5 downloads per job (`MAX_DOWNLOADS_PER_JOB`); the expiry is fixed at check time
  - a cap on jobs kept in memory (`MAX_STORED_JOBS`)
  - ffmpeg reads only stdin, uses one thread, stops at 2 hours and has a capped output
  - covers limited to JPEG/PNG/WebP and 40 megapixels (no decompression bombs)
  - MP3 tags skipped instead of buffered
- **Per-client limits** (the browser's address; IPv6 per /64): albums per hour, albums being checked at once, downloads at once. They're set in the API, and the web app passes the address (from `X-Forwarded-For` only with `TRUST_PROXY=1`, set by the deploy kit).
- **An invisible proof-of-work** before an album starts. The browser solves a small puzzle (about a second) while the form is being filled in, so scripted bulk use gets expensive. It's self-hosted (ALTCHA protocol), with no cookies and no third party.
- **CSRF protection** for server functions: requests from other sites are refused.
- **URL rules:** fetched URLs (cover and MP3 links, every redirect) must use the standard port and no credentials. More reserved IPv6 ranges are blocked, and private and unknown hosts get the same error.
- **Hardened deployment:**
  - the app container runs read-only (code owned by root, a small in-memory `/tmp`), with no Linux capabilities and with memory, CPU and process limits
  - a strict Content-Security-Policy with a per-page nonce, plus frame, permissions and opener headers
  - request bodies capped at 64 KB, and slow-client timeouts in Caddy
  - the server bootstrap now really disables SSH passwords (the old drop-in sorted after Ubuntu's own), rate-limits SSH, reboots for kernel updates at 04:00, auto-updates Docker and adds swap
- **Supply chain:**
  - CI scans the image and fails on fixable HIGH/CRITICAL vulnerabilities; npm, npx, corepack and yarn are removed from the runtime image (unused, and the only source of findings)
  - base images pinned by digest
  - weekly Dependabot PRs with a 7-day cooldown
  - pnpm's release-age, provenance (`trustPolicy: no-downgrade`) and install-script policies written out explicitly
- **No leaks:** job ids are masked in logs; child processes and plugins never see the API token; server-function errors are generic.

## 1.0.0 (2020)

**Albumie**: the original Symfony/PHP app. Its code is preserved at the [`v1.0.0`](https://github.com/vindotski/tagtape/tree/v1.0.0) tag.
