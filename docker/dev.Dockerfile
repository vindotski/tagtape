# Image for `pnpm docker:test`: Node and pnpm. The unit tests need no ffmpeg,
# yt-dlp or network. The source is bind-mounted and dependencies live in named
# volumes (see compose.dev.yaml).
# Bases are pinned by digest (Dependabot keeps them current).
FROM ghcr.io/pnpm/pnpm:12@sha256:168feba88e6a1684c99a62cbf4fe361d4e683e2a6c920d3b0acde7e15a28b62d AS pnpm-bin
FROM node:26-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1
COPY --from=pnpm-bin /opt/pnpm /opt/pnpm
RUN for bin in pnpm pnpx; do ln -s "/opt/pnpm/$bin" "/usr/local/bin/$bin"; done
ENV PNPM_STORE_DIR=/pnpm-store \
	CI=true
WORKDIR /app
