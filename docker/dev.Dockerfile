# Image for `pnpm docker:test`: Node and pnpm. The unit tests need no ffmpeg,
# yt-dlp or network. The source is bind-mounted and dependencies live in named
# volumes (see compose.dev.yaml).
# Bases are pinned by digest (Dependabot keeps them current).
FROM ghcr.io/pnpm/pnpm:12@sha256:6999b0d11d81065126ef0a226705b9d22eb9b552830d782505043d280c46ff00 AS pnpm-bin
FROM node:26-bookworm-slim@sha256:5df79989ed685e09f0a98019db4cebfb22fb9df1a53c0161664a011f7ff6b0f1
COPY --from=pnpm-bin /opt/pnpm /opt/pnpm
RUN for bin in pnpm pnpx; do ln -s "/opt/pnpm/$bin" "/usr/local/bin/$bin"; done
ENV PNPM_STORE_DIR=/pnpm-store \
	CI=true
WORKDIR /app
