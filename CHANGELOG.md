# Changelog

TagTape has one version for the web app and the API, kept in the root `package.json`. Each release is a git tag `vX.Y.Z`, published as the Docker image `vindotski/tagtape:X.Y.Z`.

## 2.0.0 (unreleased)

A complete rewrite of Albumie as **TagTape** ([tagtape.app](https://tagtape.app)).

### Added
- Web app built with TanStack Start and Tailwind, with dark mode and a mobile layout. You can reorder tracks by dragging or with buttons.
- **Background jobs with live progress**: each track goes from download to conversion to tagging, and the ZIP downloads automatically when it's ready.
- Every track is checked **before** anything downloads. Videos longer than 10 minutes, live streams, and private or unavailable videos are rejected with a reason per track, and the form keeps everything you typed.
- Covers are **centre-cropped** to 1000×1000 instead of stretched.
- ID3v2.3 tags for wide player support: title, artist, album artist, album, `n/total` track number, year, genre and front cover.
- **Unicode filenames** (`01 - Тест ✓.mp3`) instead of ASCII-only.
- **One Docker image** (`vindotski/tagtape`, amd64 + arm64) containing the web app and the API, with provenance and an SBOM.
- Reusable, provider-neutral **deploy config** for a single server (any cloud-init host: DigitalOcean, Hetzner, Vultr, Linode, AWS, …; Ubuntu or Debian, amd64 or arm64): cloud-init bootstrap, Docker Compose with Caddy for automatic HTTPS, and a manual GitHub Actions deploy with a pinned SSH host key, health-gated rollout and an outside check. See [docs/deploy.md](docs/deploy.md).

### Changed
- youtube-dl (unmaintained since 2020) is replaced by **yt-dlp**. Each video is fetched once instead of twice.
- Relicensed from GPL-2.0 to the **Unlicense** (public domain).

### Security
- Fixed **shell injection**: v1 passed the user's URL to `shell_exec`. Binaries now run with argument arrays, never through a shell, and only canonical single-video YouTube URLs are accepted.
- Added **SSRF protection** for cover image URLs (private, loopback and link-local addresses are blocked on every redirect hop), plus a size cap and a timeout.
- The API is internal to the container. The web app talks to it with a per-start random token.

## 1.0.0 (2020)

**Albumie**: the original Symfony/PHP app. Its code is preserved at the [`v1.0.0`](https://github.com/vindotski/tagtape/tree/v1.0.0) tag.
