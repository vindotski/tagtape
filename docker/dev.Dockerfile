# Development image for `pnpm docker:dev`: Node, pnpm, ffmpeg and yt-dlp.
# The source is bind-mounted and dependencies live in named volumes (see
# compose.dev.yaml), so nothing needs to be installed on the host.
# Same pinned bases as the production Dockerfile (Dependabot keeps them current).
FROM ghcr.io/pnpm/pnpm:12@sha256:41c39d1c734b0a810669c07587888aa7dbe9ef9b4c8e98b346b3654f7b269b6d AS pnpm-bin
FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9
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
