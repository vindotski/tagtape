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

TagTape turns 1–10 YouTube links plus album details (title, artist, genre, year, cover) into a ZIP of ID3-tagged MP3s laid out as an album, so the tracks sort and display correctly on any plain MP3 player. It is stateless: no accounts, no database. https://tagtape.app

## Repo layout

| Path | What |
|---|---|
| `legacy/` | Original Symfony/PHP app. **Read-only reference**: never edit, build, or lint it. |
| `apps/web/` | TanStack Start web app (`@tagtape/web`). |
| `apps/api/` | `@tagtape/api`: a Fastify 5 service that runs yt-dlp and ffmpeg, writes the tags, and builds the ZIP as background jobs. It runs on Node's native type stripping (`node src/server.ts`), with no build step. See `apps/api/README.md`. |
| `packages/shared/` | `@tagtape/shared`: zod schemas (`albumInputSchema`, `jobSnapshotSchema`), `parseYouTubeUrl`, limits. Exports TS source directly: no build step. Vite bundles it, and Node runs it with native type stripping. |

How the parts talk to each other: the browser calls TanStack Start **server functions**, and those call the API over a private network with a bearer token. The only route the browser hits directly is the ZIP download, `GET /jobs/:id/archive`.

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
- **External binaries** (yt-dlp, ffmpeg) are spawned with an **argument array, never a shell string**. The legacy app had a shell injection bug from building a command string.
- Only accept YouTube URLs, normalised by the shared parser. Fetch remote images with a size cap, a timeout, and private-IP blocking (SSRF).
- Jobs are in-memory, and their temp files are cleaned up by a TTL sweeper. Don't add persistence without asking.
- pnpm settings live in `pnpm-workspace.yaml`. `.npmrc` is for auth only (see the `pnpm` skill).
- Versions used by more than one package (zod, vitest, typescript) go in the pnpm **catalog**: write `"catalog:"` in package.json, or use `pnpm add --save-catalog`.
- Code in `packages/shared` must run in both browsers and Node: web-standard APIs only (no `node:*` imports), relative imports with `.ts` extensions, and erasable TypeScript syntax only (no enums or namespaces).
- Tests are Vitest, written as `*.test.ts` files next to the code they test.
- **Web:**
  - Calls to the API go through server functions in `src/lib/jobs.functions.ts`. The token-bearing client is `src/lib/api.server.ts`, and its `.server.ts` suffix keeps it out of the browser bundle.
  - Server functions are public endpoints, so they re-validate input with the shared schema.
  - Server env vars (`API_URL`, `API_TOKEN`, `PUBLIC_API_URL`) never get a `VITE_` prefix. Dev loads `apps/web/.env`.
  - Styling is Tailwind v4 utilities, with emerald as the accent, zinc neutrals, and automatic dark mode. Keep inputs accessible: every field has a label (`sr-only` when visually hidden) and `aria-invalid` plus `aria-describedby` for errors.
  - Form state is a client-side `AlbumDraft` (`src/lib/album-draft.ts`), validated with `albumInputSchema` before submit. Errors are keyed like `tracks.0.url`.
  - Unit tests live in `src/**/*.test.ts` and use `vitest.config.ts`, without the Start plugin. For real UI checks, drive the dev server with a browser (Playwright) against the API container.
- **API:**
  - Build the app with `buildApp({ config, pipeline })` and test routes with `app.inject()`, using the fake pipeline in `apps/api/src/test/helpers.ts`. Tests never need yt-dlp, ffmpeg or the network.
  - Config comes from environment variables only, validated in `config.ts`. Don't use config files or branch on `NODE_ENV`.
  - Errors shown to users must be `UserFacingError`. Anything else is logged and replaced with a generic message.
  - New routes require the bearer token unless they set `config: { public: true }`.
  - Spawn external processes only through `lib/exec.ts`. It never uses a shell, and it kills the whole process group on timeout or cancel; yt-dlp starts ffmpeg as a child.
  - Docker: build from the repo root with `docker build -f apps/api/Dockerfile .`. When yt-dlp breaks against YouTube, the fix is usually bumping `YTDLP_VERSION`.
  - The real-binary check is `src/e2e.test.ts`, run against a container (see `apps/api/README.md`). Run it after changing the pipeline or the yt-dlp version.

## CI (`.github/workflows/`)

- **`ci.yml`** runs on pushes to `main`/`dev` and on every PR:
  - `biome ci`, `pnpm typecheck`, `pnpm test` and `pnpm build`, with a frozen lockfile.
  - It also builds the API image and smoke-tests it: health ok, 401 without a token, non-root user, tini as PID 1.
- **`publish`** (a job in `ci.yml`) pushes the multi-arch API image (amd64 + arm64, built under QEMU) to Docker Hub as `vindotski/tagtape`:
  - It runs only on pushes to `main` and tags `v*.*.*`, and only after `checks` and `api-image` pass.
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
