<!-- intent-skills:start -->
# TanStack Intent - before editing files, run the matching guidance command.
tanstackIntent:
  - id: "@tanstack/react-router#react-router"
    run: "pnpm exec intent load @tanstack/react-router#react-router"
    for: "React bindings for TanStack Router: RouterProvider, useRouter, useRouterState, useMatch, useMatches, useLocation, useSearch, useParams, useNavigate, useLoaderData, useLoaderDeps, useRouteContext, useBlocker, useCanGoBack, Link, Navigate, Outlet, CatchBoundary, ErrorComponent. React-specific patterns for hooks, providers, SSR hydration, and createLink with forwardRef."
  - id: "@tanstack/react-start#react-start"
    run: "pnpm exec intent load @tanstack/react-start#react-start"
    for: "React bindings for TanStack Start: createStart, StartClient, StartServer, React-specific imports, re-exports from @tanstack/react-router, full project setup with React, useServerFn hook."
  - id: "@tanstack/router-core#router-core"
    run: "pnpm exec intent load @tanstack/router-core#router-core"
    for: "Framework-agnostic core concepts for TanStack Router: route trees, createRouter, createRoute, createRootRoute, createRootRouteWithContext, addChildren, Register type declaration, route matching, route sorting, file naming conventions. Entry point for all router skills."
  - id: "@tanstack/router-core#router-core/code-splitting"
    run: "pnpm exec intent load @tanstack/router-core#router-core/code-splitting"
    for: "Automatic code splitting (autoCodeSplitting), .lazy.tsx convention, createLazyFileRoute, createLazyRoute, lazyRouteComponent, getRouteApi for typed hooks in split files, codeSplitGroupings per-route override, splitBehavior programmatic config, critical vs non-critical properties."
  - id: "@tanstack/router-core#router-core/data-loading"
    run: "pnpm exec intent load @tanstack/router-core#router-core/data-loading"
    for: "Route loader option, loaderDeps for cache keys, staleTime/gcTime/ defaultPreloadStaleTime SWR caching, pendingComponent/pendingMs/ pendingMinMs, errorComponent/onError/onCatch, beforeLoad, router context and createRootRouteWithContext DI pattern, router.invalidate, Await component, deferred data loading with unawaited promises."
  - id: "@tanstack/router-core#router-core/navigation"
    run: "pnpm exec intent load @tanstack/router-core#router-core/navigation"
    for: "Link component, useNavigate, Navigate component, router.navigate, ToOptions/NavigateOptions/LinkOptions, from/to relative navigation, activeOptions/activeProps, preloading (intent/viewport/render), preloadDelay, navigation blocking (useBlocker, Block), createLink, linkOptions helper, scroll restoration, MatchRoute."
  - id: "@tanstack/router-core#router-core/not-found-and-errors"
    run: "pnpm exec intent load @tanstack/router-core#router-core/not-found-and-errors"
    for: "notFound() function, notFoundComponent, defaultNotFoundComponent, notFoundMode (fuzzy/root), errorComponent, CatchBoundary, CatchNotFound, isNotFound, NotFoundRoute (deprecated), route masking (mask option, createRouteMask, unmaskOnReload)."
  - id: "@tanstack/router-core#router-core/path-params"
    run: "pnpm exec intent load @tanstack/router-core#router-core/path-params"
    for: "Dynamic path segments ($paramName), splat routes ($ / _splat), optional params ({-$paramName}), prefix/suffix patterns ({$param}.ext), useParams, params.parse/stringify, pathParamsAllowedCharacters, i18n locale patterns."
  - id: "@tanstack/router-core#router-core/search-params"
    run: "pnpm exec intent load @tanstack/router-core#router-core/search-params"
    for: "validateSearch, search param validation with Zod/Valibot/ArkType adapters, fallback(), search middlewares (retainSearchParams, stripSearchParams), custom serialization (parseSearch, stringifySearch), search param inheritance, loaderDeps for cache keys, reading and writing search params."
  - id: "@tanstack/router-core#router-core/ssr"
    run: "pnpm exec intent load @tanstack/router-core#router-core/ssr"
    for: "Non-streaming and streaming SSR, RouterClient/RouterServer, renderRouterToString/renderRouterToStream, createRequestHandler, defaultRenderHandler/defaultStreamHandler, HeadContent/Scripts components, head route option (meta/links/styles/scripts), ScriptOnce, automatic loader dehydration/hydration, memory history on server, data serialization, document head management."
  - id: "@tanstack/router-core#router-core/type-safety"
    run: "pnpm exec intent load @tanstack/router-core#router-core/type-safety"
    for: "Full type inference philosophy (never cast, never annotate inferred values), Register module declaration, from narrowing on hooks and Link, strict:false for shared components, getRouteApi for code-split typed access, addChildren with object syntax for TS perf, LinkProps and ValidateLinkOptions type utilities, as const satisfies pattern."
  - id: "@tanstack/router-plugin#router-plugin"
    run: "pnpm exec intent load @tanstack/router-plugin#router-plugin"
    for: "TanStack Router bundler plugin for route generation and automatic code splitting. Supports Vite, Webpack, Rspack, and esbuild. Configures autoCodeSplitting, routesDirectory, target framework, and code split groupings."
  - id: "@tanstack/start-client-core#start-core"
    run: "pnpm exec intent load @tanstack/start-client-core#start-core"
    for: "Core overview for TanStack Start: tanstackStart() Vite plugin, getRouter() factory, root route document shell (HeadContent, Scripts, Outlet), client/server entry points, routeTree.gen.ts, tsconfig configuration. Entry point for all Start skills."
  - id: "@tanstack/start-client-core#start-core/deployment"
    run: "pnpm exec intent load @tanstack/start-client-core#start-core/deployment"
    for: "Deploy to Cloudflare Workers, Netlify, Vercel, Node.js/Docker, Bun, Railway. Selective SSR (ssr option per route), SPA mode, static prerendering, ISR with Cache-Control headers, SEO and head management."
  - id: "@tanstack/start-client-core#start-core/execution-model"
    run: "pnpm exec intent load @tanstack/start-client-core#start-core/execution-model"
    for: "Isomorphic-by-default principle, environment boundary functions (createServerFn, createServerOnlyFn, createClientOnlyFn, createIsomorphicFn), ClientOnly component, useHydrated hook, import protection, dead code elimination, environment variable safety (VITE_ prefix, process.env)."
  - id: "@tanstack/start-client-core#start-core/middleware"
    run: "pnpm exec intent load @tanstack/start-client-core#start-core/middleware"
    for: "createMiddleware, request middleware (.server only), server function middleware (.client + .server), context passing via next({ context }), sendContext for client-server transfer, global middleware via createStart in src/start.ts, middleware factories, method order enforcement, fetch override precedence."
  - id: "@tanstack/start-client-core#start-core/server-functions"
    run: "pnpm exec intent load @tanstack/start-client-core#start-core/server-functions"
    for: "createServerFn (GET/POST), validator (Zod or function), useServerFn hook, server context utilities (getRequest, getRequestHeader, setResponseHeader, setResponseStatus), error handling (throw errors, redirect, notFound), streaming, FormData handling, file organization (.functions.ts, .server.ts)."
  - id: "@tanstack/start-client-core#start-core/server-routes"
    run: "pnpm exec intent load @tanstack/start-client-core#start-core/server-routes"
    for: "Server-side API endpoints using the server property on createFileRoute, HTTP method handlers (GET, POST, PUT, DELETE), createHandlers for per-handler middleware, handler context (request, params, context), request body parsing, response helpers, file naming for API routes."
  - id: "@tanstack/start-server-core#start-server-core"
    run: "pnpm exec intent load @tanstack/start-server-core#start-server-core"
    for: "Server-side runtime for TanStack Start: createStartHandler, request/response utilities (getRequest, setResponseHeader, setCookie, getCookie, appendResponseHeader), three-phase request handling, AsyncLocalStorage context."
<!-- intent-skills:end -->

# TagTape — agent instructions

TagTape turns 1–10 track links (YouTube, SoundCloud, Bandcamp, Mixcloud, Vimeo) plus album details (title, artist, genre, year, cover) into a ZIP of ID3-tagged MP3s laid out as an album, so the tracks sort and display correctly on any plain MP3 player. It is stateless: no accounts, no database. https://tagtape.app

## Repo layout

| Path | What |
|---|---|
| `apps/web/` | TanStack Start web app (`@tagtape/web`). |
| `apps/api/` | `@tagtape/api`: a Fastify 5 service that runs yt-dlp and ffmpeg, writes the tags, and builds the ZIP as background jobs. It runs on Node's native type stripping (`node src/server.ts`), with no build step. See `apps/api/README.md`. |
| `packages/shared/` | `@tagtape/shared`: zod schemas (`albumInputSchema`, `jobSnapshotSchema`), `parseTrackUrl` + `SUPPORTED_SITES`, limits. Exports TS source directly: no build step. Vite bundles it, and Node runs it with native type stripping. |

How the parts talk to each other: the browser only ever talks to the web app. Server functions call the API with a bearer token, and the ZIP download goes through the web route `GET /download/:jobId`, which streams it from the API's `/jobs/:id/archive`.

**Shipping:** web and API ship as **one Docker image with one version**, built from the root `Dockerfile` and published as `vindotski/tagtape`.
- [`docker/start.mjs`](docker/start.mjs), under tini, runs:
  - the API on `127.0.0.1:4000` (internal), with a random `API_TOKEN` per start
  - the web app via `srvx` on `:$PORT` (3000)
- If either app exits, the container stops.
- `API_HOST` and `API_TOKEN` exist only to expose the API on purpose (the e2e test).
- **Versioning:**
  - **One version** for web + API: the root `package.json` `"version"` (currently 2.0.0; 1.0.0 was the PHP app).
  - CI computes `TAGTAPE_VERSION`: `X.Y.Z` on a `vX.Y.Z` tag (it must match `package.json`, or the publish fails), or `X.Y.Z+main.<sha>` on main. It's passed to the Docker build.
  - The web footer shows it (`__APP_VERSION__`, via `define` in `vite.config.ts`), and the API's `/health` reports it.
  - Release: bump `package.json`, add an entry to `CHANGELOG.md`, commit, then the user tags `vX.Y.Z` on main.
  - **2.0.0 is still unreleased.** All work goes into the `2.0.0 (unreleased)` CHANGELOG section with no version bump, until the user says 2.0.0 is done. Pushing to `main` or tagging publishes to Docker Hub, so work stays on `dev`.
- Keep web and API changes that depend on each other in the same release.

## Commands (pnpm only)

pnpm workspace (`apps/*`, `packages/*`). Run these from the repo root:

```bash
pnpm install
pnpm dev        # all apps in parallel; web on :3000 (Vite falls back to the next free port)
pnpm build
pnpm typecheck
pnpm test
pnpm check      # Biome lint + format; `pnpm fix` applies fixes
pnpm --filter @tagtape/web <script>   # run a script in one package
```

Run `pnpm check`, `pnpm typecheck` and the relevant tests before calling a task done. Shared TypeScript options live in `tsconfig.base.json`, and every package extends it. Add root-level dev tools with `pnpm add -Dw`.

## Conventions

- **Biome** is the only linter and formatter. Don't add ESLint or Prettier.
- **TypeScript strict.** Validate input with **zod** schemas from `@tagtape/shared`, and use the same schema on the client and the server.
- **External binaries** (yt-dlp, ffmpeg) are spawned with an **argument array, never a shell string**. TagTape v1 (the 2020 PHP app, at tag `v1.0.0`) had a shell injection bug from building a command string.
- **Sources are allow-listed twice.** `parseTrackUrl` (`packages/shared/src/sources.ts`) accepts only canonical single-track URLs from `SUPPORTED_SITES`, and yt-dlp runs with `--use-extractors` built from the same list.
  - To add a site, add it to `SUPPORTED_SITES` (with yt-dlp's exact extractor name from `yt-dlp --list-extractors`), write a strict parser with accept/reject tests, and probe a real track in the container.
  - Never enable yt-dlp's generic extractor or accept arbitrary URLs: that would make the server an SSRF proxy. Never try to get around DRM.
  - UI and meta copy read the site names from `SUPPORTED_SITES`, so don't hard-code them.
- Fetch remote images with a size cap, a timeout, and private-IP blocking (SSRF).
- **Never write media to disk.** Downloads stream: `yt-dlp -o -` | `ffmpeg pipe:1` → ID3 tag + MP3 → streamed ZIP. Only metadata and the cover live in memory, and a TTL sweeper forgets jobs.
  - Each flag in `pipeline/ytdlp.ts` exists for a reason documented there and in `apps/api/README.md`: no DASH, HLS via ffmpeg, `--load-info-json -` (not `/dev/stdin`), and ffmpeg with no tags, no Xing header, 256 kbps CBR.
  - After any change, check `find /tmp -type f` inside a container *during* and after a download (the e2e test plus a real abort).
  - Don't add persistence without asking.
- pnpm settings live in `pnpm-workspace.yaml`. `.npmrc` is for auth only (see the `pnpm` skill).
- Versions used by more than one package (zod, vitest, typescript) go in the pnpm **catalog**: write `"catalog:"` in package.json, or use `pnpm add --save-catalog`.
- Code in `packages/shared` must run in both browsers and Node: web-standard APIs only (no `node:*` imports), relative imports with `.ts` extensions, and erasable TypeScript syntax only (no enums or namespaces).
- Tests are Vitest, written as `*.test.ts` files next to the code they test.
- **Web:**
  - Calls to the API go through server functions in `src/lib/jobs.functions.ts`. The token-bearing client is `src/lib/api.server.ts`, and its `.server.ts` suffix keeps it out of the browser bundle.
  - Server functions are public endpoints, so they re-validate input with the shared schema.
  - Server env vars (`API_URL`, `API_TOKEN`) never get a `VITE_` prefix. Dev loads `apps/web/.env`; in the image, `docker/start.mjs` sets them.
  - Production serving: `pnpm --filter @tagtape/web start` (srvx). srvx resolves `--static` relative to the entry file, hence `--static ../client`.
  - Tailwind scans `src/` only (`@import "tailwindcss" source(".")`). Don't rely on `.gitignore`-based auto-detection: it mismatched the client and server CSS hashes in Docker.
  - Styling is Tailwind v4 utilities, with emerald as the accent, zinc neutrals, and automatic dark mode. Keep inputs accessible: every field has a label (`sr-only` when visually hidden) and `aria-invalid` plus `aria-describedby` for errors.
  - Form state is a client-side `AlbumDraft` (`src/lib/album-draft.ts`), validated with `albumInputSchema` before submit. Errors are keyed like `tracks.0.url`.
  - Unit tests live in `src/**/*.test.ts` and use `vitest.config.ts`, without the Start plugin. For real UI checks, drive the dev server with a browser (Playwright) against the API container.
- **API:**
  - Build the app with `buildApp({ config, pipeline })` and test routes with `app.inject()`, using the fake pipeline in `apps/api/src/test/helpers.ts`. Tests never need yt-dlp, ffmpeg or the network.
  - Config comes from environment variables only, validated in `config.ts`. Don't use config files or branch on `NODE_ENV`.
  - Errors shown to users must be `UserFacingError`. Anything else is logged and replaced with a generic message.
  - New routes require the bearer token unless they set `config: { public: true }`.
  - Spawn external processes only through `lib/exec.ts`. It never uses a shell, and it kills the whole process group on timeout or cancel; yt-dlp starts ffmpeg as a child.
  - Docker: the API is part of the root `Dockerfile` (`docker build -t tagtape .`). When yt-dlp breaks against YouTube, the fix is usually bumping `YTDLP_VERSION` there.
  - The real-binary check is `src/e2e.test.ts`, run against a container (see `apps/api/README.md`). Run it after changing the pipeline or the yt-dlp version.

## Deploy (`deploy/`, `docs/deploy.md`)

- **Target:** one Linux server on any provider with cloud-init (DigitalOcean, Hetzner, Vultr, Linode, AWS, …; Ubuntu 22.04/24.04 or Debian 12/13, amd64/arm64), running `deploy/compose.yaml`: the app image plus Caddy (automatic HTTPS, `www` redirect, security headers).
  - Only Caddy publishes ports.
  - Both services have health checks, so `docker compose up --wait` really waits. Without Caddy's health check, a crash-looping Caddy counted as "running".
- **`deploy/cloud-init.yaml`** bootstraps a new server: Docker (repo per distro), the `deploy` user, ufw, key-only SSH (root keeps key login), unattended upgrades and log rotation.
  - It must stay provider-neutral. SSH keys are collected from every account and stripped of options, because AWS wraps root's keys in a forced "login as ubuntu" command.
  - Validate it with `cloud-init schema`, and run its steps in `ubuntu:22.04`, `ubuntu:24.04`, `debian:12` and `debian:13` containers.
- **`.github/workflows/deploy.yml`** is manual (`workflow_dispatch` with an image `tag`) and runs in the `production` environment:
  - plain ssh/scp, with the host key pinned in `DEPLOY_KNOWN_HOSTS`
  - runs `deploy/remote-deploy.sh` on the server, then checks the site from outside
  - secrets: `DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`; variables: `DEPLOY_HOST`, `TAGTAPE_DOMAIN`, `DEPLOY_USER`
- **Rehearse changes to the deploy files locally** before relying on them:
  - push the image to a local `registry:2`
  - use a temp dir as `/opt/tagtape`, with `TAGTAPE_DOMAIN=localhost`
  - run `remote-deploy.sh`, then run the browser flow against `https://localhost`
- **Never deploy before 2.0.0 is released.** Deploys need a published image, and the user decides when that happens.

## CI (`.github/workflows/`)

- **`ci.yml`** runs on pushes to `main`/`dev` and on every PR:
  - `biome ci`, `pnpm typecheck`, `pnpm test` and `pnpm build`, with a frozen lockfile.
  - The `image` job builds the root `Dockerfile` and smoke-tests the container:
    - the page renders and its CSS loads
    - `/download/<unknown>` returns 404
    - port 4000 is not reachable from outside
    - inside the container, the API is healthy and returns 401 without a token
    - the user isn't root, and PID 1 is tini
- **`publish`** (a job in `ci.yml`) pushes the multi-arch image (amd64 + arm64, built under QEMU) to Docker Hub as `vindotski/tagtape`, with `TAGTAPE_VERSION` from its "Compute version" step:
  - It runs only on pushes to `main` and tags `v*.*.*`, and only after `checks` and `image` pass.
  - Tags: `latest` (main), `X.Y.Z`, `X.Y` and `X` (version tags), plus `sha-<short>`.
  - It uses the repo variable `DOCKERHUB_USERNAME` and the secret `DOCKERHUB_TOKEN` (a Docker Hub personal access token with Read & Write scope).
  - Never publish from `dev` or from PRs.
- **`e2e.yml`** runs weekly (and on demand): a real YouTube conversion through the API image.
  - A failure saying "confirm you're not a bot" means YouTube blocked GitHub's IP; it isn't a code bug.
  - Other failures usually mean `YTDLP_VERSION` needs bumping.
- Actions are pinned to commit SHAs, with the version in a comment. To update one, resolve the new tag's SHA with `git ls-remote`, and prefer releases that are at least a few days old.
- Lint workflows locally with `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7`.

## Git

- **The user makes all commits.** Never run `git commit` or `git push`. When a step is done, suggest a commit message with the `commit-message` skill.
- Work is done one step at a time, and each step is one commit.

## Skills

Project skills are in `.claude/skills/` (tracked by `skills-lock.json`): `fastify-best-practices`, `node`, `pnpm`, `vitest`, `commit-message`. TanStack's version-matched skills load through TanStack Intent (block below).
