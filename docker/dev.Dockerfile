# Development image for `pnpm docker:dev`: Node, pnpm and ffmpeg, nothing else.
# The source is bind-mounted and dependencies live in named volumes (see
# compose.dev.yaml), so nothing needs to be installed on the host.
# Same pinned bases as the production Dockerfile (Dependabot keeps them current).
FROM ghcr.io/pnpm/pnpm:12@sha256:41c39d1c734b0a810669c07587888aa7dbe9ef9b4c8e98b346b3654f7b269b6d AS pnpm-bin
FROM node:25-bookworm-slim@sha256:81db02c4b671288a03915da9534dbd54f96d0e7c24d80ccc54f5b36b2e684370
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=pnpm-bin /opt/pnpm /opt/pnpm
RUN for bin in pnpm pnpx; do ln -s "/opt/pnpm/$bin" "/usr/local/bin/$bin"; done
ENV PNPM_STORE_DIR=/pnpm-store \
	CI=true
WORKDIR /app
