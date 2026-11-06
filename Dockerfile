# syntax=docker/dockerfile:1
# TagTape: web app + API in one image, one version.
#   docker build -t tagtape .
#   docker run -p 3000:3000 tagtape        → http://localhost:3000
#
# Inside: web (TanStack Start via srvx) on :3000, API (Fastify, ffmpeg) on
# 127.0.0.1:4000, both started by docker/start.mjs under tini. Out of the box
# it reads direct MP3 links; images built FROM this one can add source plugins
# (TAGTAPE_PLUGINS).

# Base images are pinned by digest (the tag is kept for readability);
# Dependabot opens a PR when a new digest is published.
FROM ghcr.io/pnpm/pnpm:12@sha256:41c39d1c734b0a810669c07587888aa7dbe9ef9b4c8e98b346b3654f7b269b6d AS pnpm-bin

# --- shared base with pnpm (its own image, not Corepack: see the pnpm skill)
FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9 AS pnpm
COPY --from=pnpm-bin /opt/pnpm /opt/pnpm
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
FROM node:24-bookworm-slim@sha256:01d566e8d94d8c619591d78652babfccd3c6992a3dffa9ed5ab39e11cf6c70e9
ARG TAGTAPE_VERSION=dev
LABEL org.opencontainers.image.title="TagTape" \
	org.opencontainers.image.version="${TAGTAPE_VERSION}"
# ffmpeg converts; tini as PID 1 forwards signals and reaps orphaned processes.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg tini ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
# The base image's package managers (npm, npx, corepack, yarn) are never used
# at runtime: remove them, and the vulnerabilities in their own dependencies.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
	/usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
	/usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*

WORKDIR /app
# Keep the monorepo layout: @tagtape/shared is linked from packages/shared
# (outside node_modules), which is what lets Node type-strip its .ts source.
# Owned by root: the app (user `node`) can read its code but never change it.
COPY --from=prod-deps /app ./
COPY packages/shared/src packages/shared/src
COPY apps/api/src apps/api/src
COPY --from=build /app/apps/web/dist apps/web/dist
COPY docker/start.mjs docker/start.mjs

ENV PORT=3000 \
	TAGTAPE_VERSION=${TAGTAPE_VERSION} \
	FFMPEG_BIN=/usr/bin/ffmpeg
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s \
	CMD ["node", "-e", "Promise.all(['http://127.0.0.1:4000/health','http://127.0.0.1:'+process.env.PORT+'/'].map(u=>fetch(u).then(r=>{if(!r.ok)throw r.status}))).then(()=>process.exit(0),()=>process.exit(1))"]
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "docker/start.mjs"]
