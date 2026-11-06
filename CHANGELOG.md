# Changelog

TagTape has one version for the web app and the API, kept in the root `package.json`. Each release is a git tag `vX.Y.Z`, published as the Docker image `vindotski/tagtape:X.Y.Z`.

## 2.0.0 (unreleased)

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
- **No leaks:** job ids are masked in logs; child processes and plugins never see the API token; server-function errors are generic.

## 1.0.0 (2020)

**Albumie**: the original Symfony/PHP app. Its code is preserved at the [`v1.0.0`](https://github.com/vindotski/tagtape/tree/v1.0.0) tag.
