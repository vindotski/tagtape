# Changelog

TagTape has one version for the web app and the API, kept in the root `package.json`. Each release is a git tag `vX.Y.Z`, published as the Docker image `vindotski/tagtape:X.Y.Z`.

## 2.0.0 (unreleased)

A complete rewrite of Albumie as **TagTape** ([tagtape.app](https://tagtape.app)).

### Added
- Web app built with TanStack Start and **shadcn/ui** (React Aria base), with automatic dark mode and a mobile layout. You can reorder tracks by dragging (mouse, touch or keyboard) or with buttons.
- **Nothing is stored on the server:** after a quick check of every track, the download *is* the conversion. Tracks convert one after another while the ZIP streams to your browser (per-track progress on the page), and closing the tab stops the work. "Download again" converts again.
- **Five sources:** links from YouTube (incl. YouTube Music), SoundCloud, Bandcamp, Mixcloud and Vimeo, mixed freely in one album. Tracks can be up to **2 hours** long (v1: 10 minutes, YouTube only), so DJ mixes fit.
- Every track is checked **before** anything downloads. Tracks longer than 2 hours, live streams, and private, unavailable or DRM-protected tracks are rejected with a reason per track, and the form keeps everything you typed.
- Covers are **centre-cropped** to 1000×1000 instead of stretched.
- MP3s at **256 kbps constant bitrate** (MP3 sources like Bandcamp are copied, not re-encoded), with ID3v2.3 tags for wide player support: title, artist, album artist, album, `n/total` track number, year, genre and front cover.
- **Unicode filenames** (`01 - Тест ✓.mp3`) instead of ASCII-only.
- **One Docker image** (`vindotski/tagtape`, amd64 + arm64) containing the web app and the API, with provenance and an SBOM.
- Reusable, provider-neutral **deploy config** for a single server (any cloud-init host: DigitalOcean, Hetzner, Vultr, Linode, AWS, …; Ubuntu or Debian, amd64 or arm64): cloud-init bootstrap, Docker Compose with Caddy for automatic HTTPS, and a manual GitHub Actions deploy with a pinned SSH host key, health-gated rollout and an outside check. See [docs/deploy.md](docs/deploy.md).

### Changed
- youtube-dl (unmaintained since 2020) is replaced by **yt-dlp**. Each track is fetched once instead of twice.
- Relicensed from GPL-2.0 to **MIT**.

### Security
- Fixed **shell injection**: v1 passed the user's URL to `shell_exec`. Binaries now run with argument arrays, never through a shell, and only canonical single-track URLs from the five supported sites are accepted. yt-dlp is additionally restricted to those sites' extractors (`--use-extractors`), so it can never fetch arbitrary pages.
- Added **SSRF protection** for cover image URLs (private, loopback and link-local addresses are blocked on every redirect hop), plus a size cap and a timeout.
- The API is internal to the container. The web app talks to it with a per-start random token.

## 1.0.0 (2020)

**Albumie**: the original Symfony/PHP app. Its code is preserved at the [`v1.0.0`](https://github.com/vindotski/tagtape/tree/v1.0.0) tag.
