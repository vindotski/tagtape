# syntax=docker/dockerfile:1
# TagTape API: Node + yt-dlp + ffmpeg.
# Build from the repo root:  docker build -f apps/api/Dockerfile -t tagtape-api .

ARG NODE_VERSION=24
ARG YTDLP_VERSION=2026.10.26

# --- yt-dlp: official standalone binary, verified against the release checksums
FROM debian:bookworm-slim AS ytdlp
ARG YTDLP_VERSION
ARG TARGETARCH
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /dl
RUN set -eux; \
	case "$TARGETARCH" in \
		amd64) asset=yt-dlp_linux ;; \
		arm64) asset=yt-dlp_linux_aarch64 ;; \
		*) echo "unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
	esac; \
	base="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}"; \
	curl -fsSLo "$asset" "$base/$asset"; \
	curl -fsSLo SHA2-256SUMS "$base/SHA2-256SUMS"; \
	grep " ${asset}\$" SHA2-256SUMS | sha256sum -c -; \
	install -m 0755 "$asset" /usr/local/bin/yt-dlp

# --- production dependencies for @tagtape/api and its workspace deps
FROM node:${NODE_VERSION}-bookworm-slim AS deps
# pnpm's own image, not Corepack (see the pnpm skill: best-practices-ci).
COPY --from=ghcr.io/pnpm/pnpm:12 /opt/pnpm /opt/pnpm
RUN for bin in pnpm pnpx; do ln -s "/opt/pnpm/$bin" "/usr/local/bin/$bin"; done
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm-store,target=/var/cache/pnpm \
	pnpm install --frozen-lockfile --prod --filter "@tagtape/api..." \
		--store-dir /var/cache/pnpm --package-import-method copy

# --- runtime
FROM node:${NODE_VERSION}-bookworm-slim
# tini as PID 1 reaps orphaned processes and forwards signals; ffmpeg converts.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg tini ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=ytdlp /usr/local/bin/yt-dlp /usr/local/bin/yt-dlp

WORKDIR /app
# Keep the monorepo layout: @tagtape/shared is linked from packages/shared
# (outside node_modules), which is what lets Node type-strip its .ts source.
COPY --from=deps --chown=node:node /app ./
COPY --chown=node:node packages/shared/src packages/shared/src
COPY --chown=node:node apps/api/src apps/api/src

ENV HOST=0.0.0.0 \
	PORT=4000 \
	TMP_DIR=/tmp/tagtape \
	YTDLP_BIN=/usr/local/bin/yt-dlp \
	FFMPEG_BIN=/usr/bin/ffmpeg \
	YTDLP_JS_RUNTIME=node
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s \
	CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "apps/api/src/server.ts"]
