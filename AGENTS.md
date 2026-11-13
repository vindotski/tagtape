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

TagTape turns 1–10 track links plus album details (title, artist, genre, year, cover) into a ZIP of ID3-tagged MP3s laid out as an album, so the tracks sort and display correctly on any plain MP3 player. Visitors get guest accounts (no sign-up) from Spotcraft's backend kit, stored in Postgres; media is never stored. Out of the box it reads direct links to MP3 files and, through yt-dlp, single tracks from any site yt-dlp has an extractor for; more sources can come from plugins. https://tagtape.app

## Repo layout

| Path | What |
|---|---|
| `apps/web/` | TanStack Start web app (`@tagtape/web`). |
| `apps/api/` | `@tagtape/api`: a Fastify 5 service that loads the track sources, runs ffmpeg, writes the tags, and builds the ZIP as background jobs. It runs on Node's native type stripping (`node src/server.ts`), with no build step. See `apps/api/README.md`. |
| `packages/shared/` | `@tagtape/shared`: zod schemas (`albumInputSchema`, `jobSnapshotSchema`), `parseWebUrl`, limits. Exports TS source directly: no build step. Vite bundles it, and Node runs it with native type stripping. |

How the parts talk to each other: the browser only ever talks to the web app. Server functions call the API with a bearer token, and the ZIP download goes through the web route `GET /download/:jobId`, which streams it from the API's `/jobs/:id/archive`.

**Shipping:** web and API ship as **one Docker image with one version**, built from the root `Dockerfile` and published as `vindotski/tagtape`.
- [`docker/start.mjs`](docker/start.mjs), under tini, runs:
  - the API on `127.0.0.1:4000` (internal), with a random `API_TOKEN` per start
  - the web app via `srvx` on `:$PORT` (3000)
- If either app exits, the container stops.
- `API_HOST` and `API_TOKEN` exist only to expose the API on purpose (the e2e test).
- **Versioning:**
  - **One version** for web + API: the root `package.json` `"version"` (currently 3.2.0; 1.0.0 was the PHP app).
  - CI computes `TAGTAPE_VERSION`: `X.Y.Z` on a `vX.Y.Z` tag (it must match `package.json`, or the publish fails), or `X.Y.Z+main.<sha>` on main. It's passed to the Docker build.
  - The web footer shows it (`__APP_VERSION__`, via `define` in `vite.config.ts`), and the API's `/health` reports it.
  - Release: bump `package.json`, add an entry to `CHANGELOG.md`, commit, then the user tags `vX.Y.Z` on main.
  - **2.0.0 was released on 2026-11-06, 3.0.0 (guest accounts, Spotcraft) on 2026-11-08, 3.1.0 (links from sites, saved albums, home page) on 2026-11-13, 3.2.0 (pausing sites that refuse the server) on 2026-11-13.** From now on:
    - New work goes under `## Unreleased` in `CHANGELOG.md`, without a version bump.
    - At release time the user picks the version (semver: fixes → patch, features → minor, breaking changes → major). Bump `package.json`, rename `## Unreleased` to the version and date, commit, merge to `main`, and the user tags `vX.Y.Z`.
  - **Branches:** `dev` is the working branch and GitHub's default branch (PRs target it); `main` is production. Pushing `main` publishes `latest` and `sha-…` to Docker Hub; tagging `vX.Y.Z` publishes `X.Y.Z`, `X.Y` and `X`. Only the user merges, pushes and tags.
- Keep web and API changes that depend on each other in the same release.

## Commands (pnpm only)

**Run things through Docker.** The user doesn't want to install dependencies or binaries (ffmpeg, …) on their machine, so never ask them to; use these scripts from the repo root:

```bash
pnpm docker        # the image with Spotcraft's restrictions + local Postgres, on :3000 (PORT=… to change)
pnpm docker:dev    # hot reload in containers (compose.dev.yaml); stop with pnpm docker:down
pnpm docker:test   # pnpm check + typecheck + test inside the dev container, with Postgres
```

- `compose.dev.yaml` + `docker/dev.Dockerfile`: Node, pnpm and ffmpeg in one dev image. The source is bind-mounted and `node_modules` live in named volumes (Linux native builds never mix with the host's).
- The API isn't published in dev either; `web` reaches it at `http://api:4000` with a fixed dev-only token.
- Port 3000 may be busy (the user often has a container running): use `PORT=3010`.
- In dev containers, `/tmp` holds two empty pnpm lock files; that's expected (no media).

pnpm workspace (`apps/*`, `packages/*`). The plain scripts, from the repo root:

```bash
pnpm install
pnpm dev        # all apps in parallel; web on :3000 (Vite falls back to the next free port)
pnpm build
pnpm typecheck
pnpm test
pnpm check      # Biome lint + format; `pnpm fix` applies fixes
pnpm --filter @tagtape/web <script>   # run a script in one package
```

Run `pnpm check`, `pnpm typecheck` and the relevant tests (or `pnpm docker:test`) before calling a task done. Shared TypeScript options live in `tsconfig.base.json`, and every package extends it. Add root-level dev tools with `pnpm add -Dw`.

## Conventions

- **Biome** is the only linter and formatter. Don't add ESLint or Prettier.
- **TypeScript strict.** Validate input with **zod** schemas from `@tagtape/shared`, and use the same schema on the client and the server.
- **External binaries** (ffmpeg, yt-dlp, and whatever plugins run) are spawned with an **argument array, never a shell string**. TagTape v1 (the 2020 PHP app, at tag `v1.0.0`) had a shell injection bug from building a command string.
- **Tracks come from sources** (`Source` in `apps/api/src/plugins/api.ts`), tried in order: plugins from `TAGTAPE_PLUGINS`, then the built-in `direct`, then the built-in `ytdlp`. A link is accepted only if a source's `match()` claims it; the shared schema only checks that it's an http(s) URL.
  - `direct` (`sources/direct.ts`): http(s) links whose path ends in `.mp3`. It reads only the head of the file to check it (`sources/mp3.ts`).
  - `ytdlp` (`sources/ytdlp.ts`, on when `YTDLP_BIN` is set, as in the image): any other public link; yt-dlp decides at the check. Keep these rules:
    - **Never the `generic` extractor** (`--use-extractors default,-generic`), so arbitrary pages are never read.
    - Every request yt-dlp and its ffmpeg make goes through the **egress proxy** (`lib/egress-proxy.ts`: public addresses, ports 80/443 only).
    - **No cookies, logins or account features, and never anything that gets around DRM** (refuse with a clear message).
    - **Never get past a site's anti-bot checks or rate limits**: no cookies, accounts, PO-token helpers or rotating/residential proxies. When a site refuses the server ("confirm you're not a bot", unusual traffic, HTTP 429), say so and pause that site for `YTDLP_BLOCK_COOLDOWN_SEC` (600; 0 never pauses): its links then fail at once with when to retry. Datacenter IPs get refused often; direct MP3 links are the reliable path.
    - Single tracks only: playlists and sets are refused. `YTDLP_MAX_CHECKS` caps yt-dlp checks (~100 MB each); downloads count under `MAX_ACTIVE_STREAMS`. Don't put both under one cap: long downloads would starve the checks (`CHECK_TIMEOUT_SEC`).
    - yt-dlp is pinned in `docker/yt-dlp.version` (official onedir release, checksum-verified by `docker/install-ytdlp.sh`). Dependabot can't bump it: bump it when a site breaks or Trivy flags it.
  - The plugin contract (`plugins/api.ts`) depends only on Node's types, so plugins elsewhere can copy it verbatim. Bump `PLUGIN_API_VERSION` for incompatible changes.
- **The core names no sites** (what kept youtube-dl on GitHub): yt-dlp is a generic engine, and no code, tests, docs, examples or screenshots name third-party sites or link to plugin repositories. Test data uses made-up names on `example.com` hosts, never commercial songs; real-site e2e links live in a CI variable, never in the repo.
  - UI copy reads the source names from the API (`GET /sources`, via the root route's loader), so don't hard-code them.
- **Abuse limits:**
  - **Per-client limits live in the API** (`jobs/manager.ts`), keyed by the `x-tagtape-client` header the web app sets (`lib/client.ts`: IPv4 as is, IPv6 per /64, missing = `local`).
  - The web app takes the address from `X-Forwarded-For` (its last entry) **only with `TRUST_PROXY=1`** (`client-ip.server.ts`). It's set on Spotcraft, whose Caddy replaces the header with the visitor's address. Never enable it without a proxy in front.
  - Starting an album needs a **proof-of-work** (`lib/pow*.ts`, altcha-lib, PBKDF2): a challenge from `getChallenge`, solved in a Web Worker while the form is filled in, and verified once in `startJob` (replays refused).
  - Server functions are protected by the CSRF middleware in `src/start.ts`.
- Fetch user-supplied URLs only through `lib/http.ts` (`openPublicUrl`): private addresses blocked on every hop, IP literals included, a fresh connection per request. Add a size cap and a timeout (SSRF).
- **Hardened runtime** (what Spotcraft applies to hosted apps; `docker/compose.local.yaml` and CI's smoke test mirror it):
  - The app container is **read-only**, with a 64 MB `noexec` `/tmp` tmpfs. Its code is root-owned in the image, and it runs as `node` with no capabilities, `no-new-privileges`, 256 PIDs and memory/CPU limits. Anything that needs to write to disk will fail there, which is intended.
- **Edge vs. app:** Spotcraft's Caddy sets only HSTS, `nosniff` and `Referrer-Policy`. The app's request middleware (`src/start.ts`, `lib/request-limits.ts`) adds a 64 KB body limit (411 without a length, 413 over it), plus `X-Frame-Options`, COOP and `Permissions-Policy`.
- **CSP:** the web app sets it per page with a fresh nonce for the router's inline scripts (`src/lib/csp.server.ts`, production builds only). A new third-party script, style, font, image host or connection needs the policy changed on purpose; prefer self-hosting.
- **Guest accounts** come from Spotcraft's backend kit, `@spotcraft/kit` (`apps/web/src/lib/backend.server.ts`), on Postgres. Keep it the same version as the Spotcraft the app deploys to.
  - Server-only: never import it from client code. The browser only carries the httpOnly session cookie.
  - Create guests only on writes (`ensureGuest` in `startJob`, after the proof-of-work). Reads use `currentGuest`, which never creates one.
  - Env: `DATABASE_URL` (Spotcraft sets it), `AUTH_SECRET` (32+ chars), `PUBLIC_URL`. The backend is created lazily, because `vite build` imports the module without a database.
  - Spotcraft owns the `auth` schema: never change it. TagTape's tables go in `public`, keyed to `auth.users (id) ON DELETE CASCADE`.
  - **Album history** (`src/lib/albums.server.ts`): `startJob` records an album after the API accepts it (or updates it when `albumId` is a stored album being made again). Albums are stored in full as typed, so they're reproducible: details, track titles and links, the cover's URL. Never media or images. `/albums` lists them, `/albums/$albumId` reopens one (`fetchAlbum`) and deletes it (`removeAlbum`); reads go through `currentGuest`. Up to `HISTORY_LIMIT` (50) per guest, by last made. Database failures never block an album: history is a convenience.
  - TagTape migrates `public` itself, on first use (`migrateApp`: numbered SQL in `MIGRATIONS`, one transaction, advisory lock, `tagtape_migrations` table). Migrations only add, so an older release keeps working during a rollover.
  - Database tests (`albums.test.ts`) need `TAGTAPE_TEST_DATABASE_URL` (a role that may create databases) and are skipped without it. `pnpm docker:test` (the `test` service) and CI's `checks` job provide Postgres.
  - In dev, `compose.dev.yaml` runs Postgres and a `migrate` service (`apps/web/scripts/dev-migrate.ts`) before `web`. On Spotcraft, its agent migrates `auth`.
  - `pnpm-workspace.yaml` excludes `@spotcraft/kit` (our own project) from `minimumReleaseAge`; its dependencies still wait.
- **Never write media to disk.** Downloads stream: source → `ffmpeg pipe:1` → ID3 tag + MP3 → streamed ZIP. Only metadata and the cover live in memory, and a TTL sweeper forgets jobs.
  - ffmpeg writes no tags and no Xing header (we write the only tag; a header written before the end of a stream would be wrong), and CBR (VBR is re-encoded to 256 kbps).
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
  - UI is **shadcn/ui** on the React Aria base (`components.json`, preset `b2oXkljRz`: vega style, green on olive, no radius, Oxanium, lucide icons).
    - Add components with `pnpm dlx shadcn@latest add <name>` from `apps/web`. `src/components/ui/` is vendor code: Biome formats it but doesn't lint it. Prefer composing over editing those files.
    - `shadcn init` ignores the preset in this app (it falls back to legacy prompts). To re-theme, scaffold the template in a scratch directory and copy the CSS variables over.
    - Use theme tokens (`bg-card`, `text-muted-foreground`, `text-destructive`, `text-primary`), never raw palette colours. Dark mode follows `prefers-color-scheme` (a `@custom-variant` in `styles.css`), with no `.dark` class.
    - Track reordering stays on dnd-kit: a React Aria GridList is a single Tab stop, and its arrow-key row navigation fights the text inputs inside the rows.
  - Keep inputs accessible: every field has a label (`sr-only` when visually hidden) and `aria-invalid` plus `aria-describedby` for errors (`components/text-field.tsx`).
  - Form state is a client-side `AlbumDraft` (`src/lib/album-draft.ts`), validated with `albumInputSchema` before submit. Errors are keyed like `tracks.0.url`.
  - Unit tests live in `src/**/*.test.ts` and use `vitest.config.ts`, without the Start plugin. For real UI checks, drive the dev server with a browser (Playwright) against the API container.
- **API:**
  - Build the app with `buildApp({ config, pipeline })` and test routes with `app.inject()`, using the fake pipeline in `apps/api/src/test/helpers.ts`. Tests never need ffmpeg or the network.
  - Config comes from environment variables only, validated in `config.ts`. Don't use config files or branch on `NODE_ENV`.
  - Errors shown to users must be `UserFacingError`. Anything else is logged and replaced with a generic message.
  - New routes require the bearer token unless they set `config: { public: true }`.
  - Spawn external processes only through `lib/exec.ts`. It never uses a shell, and it kills the whole process group on timeout or cancel; a tool may start its own children.
  - Docker: the API is part of the root `Dockerfile` (`docker build -t tagtape .`). Images built `FROM` it may add plugins via `TAGTAPE_PLUGINS`.
  - The real-binary check is `src/e2e.test.ts`, run against a container (see `apps/api/README.md`). Run it after changing the pipeline.

## Deploy (Spotcraft, `docs/deploy.md`)

- **Target:** [Spotcraft](https://spotcraft.dev) (the user's own self-hosted deploy tool; source in `../spotcraft`). The app runs the published image with a Postgres database, on the domain `tagtape.app`.
  - Spotcraft deploys hosted apps **from its dashboard only**. TagTape has no deploy workflow, and only the user deploys.
  - A deploy waits up to 120 s for the image's `HEALTHCHECK` and rolls back on failure. It stops the old container before starting the new one, so running downloads are cut.
  - Spotcraft provisions the database (`app_tagtape`) and migrates `auth` before the container starts. TagTape migrates `public` itself.
  - Environment set in the dashboard: `TRUST_PROXY=1`, `PUBLIC_URL`, `AUTH_SECRET`, `NODE_OPTIONS`, plus any tuning. `DATABASE_URL` comes from the Database checkbox.
- **Rehearse a release with `pnpm docker`** (`docker/compose.local.yaml`): the production image with Spotcraft's container settings and a database provisioned by the kit's `provision`, like Spotcraft's agent does it. Run the browser flow and the `/tmp` check against it.
- **Deploys need a published image** (a `sha-…` tag from `main`, or a release tag).
- Postgres (`postgres:18.6-trixie`, by digest) in `compose.dev.yaml`, `docker/compose.local.yaml` and CI follows Spotcraft's apps server (`infra/apps-server/compose.yaml` there), not Dependabot.

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
  - `latest` is enabled by `github.ref == 'refs/heads/main'`, not `{{is_default_branch}}` (that's `dev`), and `flavor: latest=false` keeps `type=semver` from adding it on version tags.
  - It uses the repo variable `DOCKERHUB_USERNAME` and the secret `DOCKERHUB_TOKEN` (a Docker Hub personal access token with Read & Write scope).
  - Never publish from `dev` or from PRs.
- **`e2e.yml`** runs weekly (and on demand): real public MP3 links converted through the image. Scheduled runs check out `main`, since schedules always start from the default branch (`dev`).
- **Image scan:** the `image` job runs Trivy (the `aquasec/trivy` CLI image, pinned by digest, not an action). Fixable HIGH/CRITICAL vulnerabilities fail the build. The runtime image has no npm/npx/corepack/yarn (removed in the `Dockerfile`), so their bundled dependencies can't be flagged or abused.
- **Base images** (`node`, `ghcr.io/pnpm/pnpm`) are pinned by digest, with the tag kept for readability, in the `Dockerfile` and `docker/dev.Dockerfile`. Don't use a build `ARG` or `COPY --from=<image>` for them: Dependabot can't update those.
- **Dependabot** (`.github/dependabot.yml`) opens weekly grouped PRs against `dev` for actions, npm and the Docker bases, with a 7-day cooldown. It skips Node and `@types/node` majors: move both to the next LTS on purpose.
- **pnpm supply chain** (`pnpm-workspace.yaml`): `minimumReleaseAge`, `trustPolicy: no-downgrade`, `blockExoticSubdeps` and `strictDepBuilds` are written out explicitly.
  - The root `@types/node` (catalog) exists so vitest's optional peer resolves to Node 26 types. Without it, pnpm auto-installs an old `@types/node` for `packages/shared`, which trips `trustPolicy`.
  - If `trustPolicy` flags a package, find out why before adding an exception.
  - Security fixes for transitive packages go in `overrides:` in `pnpm-workspace.yaml`, scoped to the vulnerable range (`'pkg@<fixed': ^fixed`), with a comment naming the advisory and when to remove it.
- Actions are pinned to commit SHAs, with the version in a comment. To update one, resolve the new tag's SHA with `git ls-remote`, and prefer releases that are at least a few days old.
- Lint workflows locally with `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7`.

## Git

- **The agent commits each finished step** (one step = one commit), with a message from the `commit-message` skill, after `pnpm check`, typecheck and the tests pass. Split changes that do more than one thing into separate commits.
- New work goes on its own branch, `claude/<topic>`, cut from `dev`.
- **Never push, merge into `dev` or `main`, tag, or rewrite pushed history.** The user does that.

## Skills

Project skills are in `.claude/skills/` (tracked by `skills-lock.json`): `fastify-best-practices`, `node`, `pnpm`, `vitest`, `commit-message`. TanStack's version-matched skills load through TanStack Intent (block below).
