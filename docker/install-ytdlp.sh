#!/bin/sh
# Installs the official yt-dlp "onedir" release, verified against the
# release's SHA2-256SUMS, into DEST (default /opt/yt-dlp) as DEST/yt-dlp.
# Used by the Dockerfile and docker/dev.Dockerfile.
#
# Not the single-file binary: that one unpacks ~90 MB into /tmp on *every* run
# and leaves it behind when a cancelled download kills it. onedir is unpacked
# once, here, so runs write nothing to disk.
#
# Usage: install-ytdlp.sh [VERSION] [DEST]   (VERSION defaults to yt-dlp.version)
set -eu
here=$(dirname "$0")
version=${1:-}
[ -n "$version" ] || version=$(tr -d '[:space:]' < "$here/yt-dlp.version")
dest=${2:-/opt/yt-dlp}

if [ -x "$dest/yt-dlp" ] && [ "$("$dest/yt-dlp" --version 2>/dev/null)" = "$version" ]; then
	echo "yt-dlp $version already installed in $dest"
	exit 0
fi

case "$(uname -m)" in
	x86_64) name=yt-dlp_linux ;;
	aarch64 | arm64) name=yt-dlp_linux_aarch64 ;;
	*) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

if ! command -v curl >/dev/null || ! command -v unzip >/dev/null; then
	apt-get update
	apt-get install -y --no-install-recommends ca-certificates curl unzip
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
base="https://github.com/yt-dlp/yt-dlp/releases/download/${version}"
curl -fsSLo "$work/$name.zip" "$base/$name.zip"
curl -fsSLo "$work/SHA2-256SUMS" "$base/SHA2-256SUMS"
(cd "$work" && grep " ${name}.zip\$" SHA2-256SUMS | sha256sum -c -)

mkdir -p "$dest"
find "$dest" -mindepth 1 -delete
unzip -q "$work/$name.zip" -d "$dest"
mv "$dest/$name" "$dest/yt-dlp"
chmod 0755 "$dest/yt-dlp"
"$dest/yt-dlp" --version
