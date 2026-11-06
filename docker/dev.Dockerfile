# Development image for `pnpm docker:dev`: Node, pnpm and ffmpeg, nothing else.
# The source is bind-mounted and dependencies live in named volumes (see
# compose.dev.yaml), so nothing needs to be installed on the host.
ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-bookworm-slim
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/pnpm/pnpm:12 /opt/pnpm /opt/pnpm
RUN for bin in pnpm pnpx; do ln -s "/opt/pnpm/$bin" "/usr/local/bin/$bin"; done
ENV PNPM_STORE_DIR=/pnpm-store \
	CI=true
WORKDIR /app
