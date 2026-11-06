# syntax=docker/dockerfile:1
# TagTape: web app + API in one image, one version.
#   docker build -t tagtape .
#   docker run -p 3000:3000 tagtape        → http://localhost:3000
#
# Inside: web (TanStack Start via srvx) on :3000, API (Fastify, yt-dlp, ffmpeg)
# on 127.0.0.1:4000, both started by docker/start.mjs under tini.

ARG NODE_VERSION=24
ARG YTDLP_VERSION=2026.10.26

# --- yt-dlp: official "onedir" release, verified against the release checksums.
# Not the single-file binary: that one unpacks ~90 MB into /tmp on *every* run
# and leaves it behind when a cancelled download kills it. onedir is unpacked
# once, here, so runs write nothing to disk.
FROM debian:bookworm-slim AS ytdlp
ARG YTDLP_VERSION
ARG TARGETARCH
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates curl unzip \
	&& rm -rf /var/lib/apt/lists/*
WORKDIR /dl
RUN set -eux; \
	case "$TARGETARCH" in \
		amd64) name=yt-dlp_linux ;; \
		arm64) name=yt-dlp_linux_aarch64 ;; \
		*) echo "unsupported architecture: $TARGETARCH" >&2; exit 1 ;; \
	esac; \
	base="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}"; \
	curl -fsSLo "$name.zip" "$base/$name.zip"; \
	curl -fsSLo SHA2-256SUMS "$base/SHA2-256SUMS"; \
	grep " ${name}.zip\$" SHA2-256SUMS | sha256sum -c -; \
	unzip -q "$name.zip" -d /opt/yt-dlp; \
	mv "/opt/yt-dlp/$name" /opt/yt-dlp/yt-dlp; \
	chmod 0755 /opt/yt-dlp/yt-dlp; \
	/opt/yt-dlp/yt-dlp --version

# --- shared base with pnpm (its own image, not Corepack: see the pnpm skill)
FROM node:${NODE_VERSION}-bookworm-slim AS pnpm
COPY --from=ghcr.io/pnpm/pnpm:12 /opt/pnpm /opt/pnpm
RUN for bin in pnpm pnpx; do ln -s "/opt/pnpm/$bin" "/usr/local/bin/$bin"; done
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/

# --- build the web app (needs dev dependencies: vite, tailwind, …)
FROM pnpm AS build
# The web footer shows this version (vite.config.ts reads it at build time).
ARG TAGTAPE_VERSION
ENV TAGTAPE_VERSION=${TAGTAPE_VERSION}
RUN --mount=type=cache,id=pnpm-store,target=/var/cache/pnpm \
	pnpm install --frozen-lockfile --filter "@tagtape/web..." \
		--store-dir /var/cache/pnpm
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @tagtape/web build

# --- production dependencies only, for both apps
FROM pnpm AS prod-deps
RUN --mount=type=cache,id=pnpm-store,target=/var/cache/pnpm \
	pnpm install --frozen-lockfile --prod \
		--filter "@tagtape/api..." --filter "@tagtape/web..." \
		--store-dir /var/cache/pnpm --package-import-method copy

# --- runtime
FROM node:${NODE_VERSION}-bookworm-slim
ARG TAGTAPE_VERSION=dev
LABEL org.opencontainers.image.title="TagTape" \
	org.opencontainers.image.version="${TAGTAPE_VERSION}"
# ffmpeg converts; tini as PID 1 forwards signals and reaps orphaned processes.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg tini ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
COPY --from=ytdlp /opt/yt-dlp /opt/yt-dlp
RUN ln -s /opt/yt-dlp/yt-dlp /usr/local/bin/yt-dlp

WORKDIR /app
# Keep the monorepo layout: @tagtape/shared is linked from packages/shared
# (outside node_modules), which is what lets Node type-strip its .ts source.
COPY --from=prod-deps --chown=node:node /app ./
COPY --chown=node:node packages/shared/src packages/shared/src
COPY --chown=node:node apps/api/src apps/api/src
COPY --from=build --chown=node:node /app/apps/web/dist apps/web/dist
COPY --chown=node:node docker/start.mjs docker/start.mjs

ENV PORT=3000 \
	TAGTAPE_VERSION=${TAGTAPE_VERSION} \
	YTDLP_BIN=/usr/local/bin/yt-dlp \
	FFMPEG_BIN=/usr/bin/ffmpeg \
	YTDLP_JS_RUNTIME=node \
	TAGTAPE_PLUGINS=/app/apps/api/src/sources/sites/index.ts
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s \
	CMD ["node", "-e", "Promise.all(['http://127.0.0.1:4000/health','http://127.0.0.1:'+process.env.PORT+'/'].map(u=>fetch(u).then(r=>{if(!r.ok)throw r.status}))).then(()=>process.exit(0),()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "docker/start.mjs"]
