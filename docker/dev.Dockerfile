# Development image for `pnpm docker:dev`: Node, pnpm, ffmpeg and yt-dlp.
# The source is bind-mounted and dependencies live in named volumes (see
# compose.dev.yaml), so nothing needs to be installed on the host.
# Same pinned bases as the production Dockerfile (Dependabot keeps them current).
FROM ghcr.io/pnpm/pnpm:12@sha256:6999b0d11d81065126ef0a226705b9d22eb9b552830d782505043d280c46ff00 AS pnpm-bin
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=pnpm-bin /opt/pnpm /opt/pnpm
RUN for bin in pnpm pnpx; do ln -s "/opt/pnpm/$bin" "/usr/local/bin/$bin"; done
# The same pinned yt-dlp as the production image.
COPY docker/install-ytdlp.sh docker/yt-dlp.version /dl/
RUN sh /dl/install-ytdlp.sh "" /opt/yt-dlp \
	&& rm -rf /var/lib/apt/lists/* /dl
ENV PNPM_STORE_DIR=/pnpm-store \
	YTDLP_BIN=/opt/yt-dlp/yt-dlp \
	CI=true
WORKDIR /app
