<!-- intent-skills:start -->
# TanStack Intent - before editing files, run the matching guidance command.
tanstackIntent:
  - id: "@tanstack/react-router#react-router"
    run: "pnpm exec intent load @tanstack/react-router#react-router"
    for: "React bindings for TanStack Router: RouterProvider, useRouter, useRouterState, useMatch, useMatches, useLocation, useSearch, useParams, useNavigate, useLoaderData, useLoaderDeps, useRouteContext, useBlocker, useCanGoBack, Link, Navigate, Outlet, CatchBoundary, ErrorComponent. React-specific patterns for hooks, providers, SSR hydration, and createLink with forwardRef."
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
<!-- intent-skills:end -->

# TagTape — agent instructions

TagTape turns 1–10 track links plus album details (title, artist, genre, year, cover) into a folder of ID3-tagged MP3s laid out as an album, so the tracks sort and display correctly on any plain MP3 player. It is a desktop app (Electron) that runs entirely on the user's computer: no server, no accounts. Out of the box it reads direct links to MP3 files and, through the bundled yt-dlp, single tracks from any site yt-dlp has an extractor for; more sources can come from plugins. A React Native mobile app is planned as 4.1.0. https://tagtape.app

Versions 2 and 3 were a hosted web app (TanStack Start + a Fastify API in one Docker image); that code ends at tag `v3.2.0`. Version 1 was a 2020 PHP app (tag `v1.0.0`).

## Repo layout

| Path | What |
|---|---|
| `desktop/` | `@tagtape/desktop`: the Electron app (electron-vite, electron-builder). |
| `desktop/src/main/` | Main process: window, IPC handlers (`ipc.ts`), the local library (`library.ts`). |
| `desktop/src/preload/` | The sandboxed bridge that exposes `window.tagtape`. |
| `desktop/src/renderer/` | The React UI (TanStack Router, hash history; shadcn/ui on React Aria). |
| `desktop/src/core/` | The pipeline: jobs, sources, plugins, process handling, the album-folder writer. No Electron imports; tested in plain Node. |
| `desktop/src/ipc.ts` | The contract between page and main process (types + channel names). |
| `website/` | `@tagtape/website`: the static Astro product site, deployed to GitHub Pages. |
| `shared/` | `@tagtape/shared`: zod schemas, limits, `parseWebUrl`, the ID3v2.3 writer, file naming, probe rules, yt-dlp error mapping. Exports TS source directly. |
| `spike/mobile/` | Throwaway proof that the pipeline runs in a React Native app (Android and iOS). Outside the workspace, Biome and CI; replaced by `mobile/` in 4.1.0. |

How the parts talk: the page calls `window.tagtape` (see `renderer/lib/bridge.ts`); the preload forwards each call over IPC; the main process validates the arguments and calls the pipeline (`createTagTape` in `core/index.ts`). For anything Electron-specific, load the `electron` skill first.

**Versioning and releases:**
- **One version** for everything: the root `package.json` `"version"`. The app reads it at build time (`__APP_VERSION__`), and electron-builder uses it.
- **Released so far:** 2.0.0 (2026-11-06), 3.0.0 (2026-11-08), 3.1.0 and 3.2.0 (2026-11-13), all the hosted web app. **4.0.0 is the desktop app** (not released yet).
- New work goes under `## Unreleased` in `CHANGELOG.md`, without a version bump.
- At release time the user picks the version (semver). Bump `package.json`, rename `## Unreleased` to the version and date, commit, merge to `main`, and the user tags `vX.Y.Z`.
- A `vX.Y.Z` tag (it must match `package.json`, or CI fails) makes CI attach every installer and a `SHA256SUMS.txt` to a **draft** GitHub Release. The user publishes it; the website links to the latest published release.
- **Branches:** `dev` is the working branch and GitHub's default branch (PRs target it); `main` is production (the website deploys from it). Only the user merges, pushes and tags.
- Installers are **unsigned** for now (macOS: ad-hoc). The website explains how to open them.

## Commands (pnpm only)

The app runs on the host (Electron needs a display); Node 26 and pnpm are the only things it needs installed. ffmpeg and yt-dlp are fetched into the repo by a script, never installed system-wide.

```bash
pnpm install
pnpm binaries      # fetch the pinned ffmpeg and yt-dlp for this platform (checksum-verified)
pnpm dev           # the desktop app with hot reload
pnpm build         # build the app's code and the website
pnpm package       # installers for this platform, in desktop/dist
pnpm typecheck
pnpm test
pnpm check         # Biome lint + format; `pnpm fix` applies fixes
pnpm docker:test   # check + typecheck + test in a clean Linux container
pnpm --filter @tagtape/website dev    # the website on its own
```

Run `pnpm check`, `pnpm typecheck` and `pnpm test` before calling a task done, and check app changes in the real window (the `electron` skill says how, without touching the user's own data). Shared TypeScript options live in `tsconfig.base.json`. Add root-level dev tools with `pnpm add -Dw`.

## Conventions

- **Biome** is the only linter and formatter. Don't add ESLint or Prettier. (`.astro` files and vendored `components/ui` are not linted.)
- **TypeScript strict.** Validate input with **zod** schemas from `@tagtape/shared`; the page and the main process use the same schema.
- **External binaries** (ffmpeg, yt-dlp, and whatever plugins run) are spawned only through `core/lib/exec.ts`, with an **argument array, never a shell string**, a minimal environment, and the whole process tree killed on timeout or cancel (process groups on POSIX, `taskkill /T` on Windows). TagTape v1 had a shell injection bug from building a command string.
- **Tracks come from sources** (`Source` in `core/plugins/api.ts`), tried in order: plugins from `TAGTAPE_PLUGINS`, then the built-in `direct`, then the built-in `ytdlp`. A link is accepted only if a source's `match()` claims it; the shared schema only checks that it's an http(s) URL.
  - `direct` (`sources/direct.ts`): http(s) links whose path ends in `.mp3`. It reads only the head of the file to check it (`sources/mp3.ts`).
  - `ytdlp` (`sources/ytdlp.ts`): any other public link; yt-dlp decides at the check. Keep these rules:
    - **Never the `generic` extractor** (`--use-extractors default,-generic`), so arbitrary pages are never read.
    - Every request yt-dlp and its ffmpeg make goes through the **egress proxy** (`lib/egress-proxy.ts`: public addresses, ports 80/443 only).
    - **No cookies, logins or account features, and never anything that gets around DRM** (refuse with a clear message).
    - **Never get past a site's anti-bot checks or rate limits**: no cookies, accounts, PO-token helpers or rotating/residential proxies. When a site refuses the device, say so and pause that site (`LIMITS.ytdlpCooldownMs`, 10 minutes): its links then fail at once with when to retry.
    - Single tracks only: playlists and sets are refused. Checks and downloads have separate caps (`LIMITS` in `core/options.ts`); don't put both under one cap.
    - yt-dlp's JavaScript runtime is Electron's own binary run as Node (`ELECTRON_RUN_AS_NODE=1`).
  - The plugin contract (`plugins/api.ts`) depends only on Node's types, so plugins elsewhere can copy it verbatim. Bump `PLUGIN_API_VERSION` for incompatible changes. The packaged app loads plugins as JavaScript modules.
- **The core names no sites** (what kept youtube-dl on GitHub): yt-dlp is a generic engine, and no code, tests, docs, examples, screenshots or website copy name third-party sites or link to plugin repositories. Test data uses made-up names on `example.com` hosts, never commercial songs; real-site e2e links live in a CI variable, never in the repo.
  - UI copy reads the source names from the pipeline (`sources()`, via the root route's loader), so don't hard-code them.
- Fetch user-supplied URLs only through `lib/http.ts` (`openPublicUrl`): private addresses blocked on every hop, IP literals included, a fresh connection per request. Add a size cap and a timeout.
- **Media goes only into the album folder the user chose.** Tracks stream source → `ffmpeg pipe:1` → ID3 tag + MP3 → `<destination>/<Artist - Album>/NN - Title.mp3.part`, renamed when complete (`pipeline/album-folder.ts`). No temporary media anywhere else; only metadata and the cover live in memory.
  - A failed or cancelled album removes every file it wrote, then its folder if empty. An existing folder is never reused (the new one gets ` (2)`).
  - ffmpeg writes no tags and no Xing header (we write the only tag), and CBR (VBR is re-encoded to 256 kbps).
  - After any pipeline change, run the e2e test and cancel an album mid-save in the real window; check the destination and the temp folder for leftovers.
- **The local library** (`main/library.ts`): one JSON file in the app's data folder with the last 50 albums as typed (details, track titles and links, the cover's URL; never media) and the save folder. Atomic writes, one at a time. Failures never block an album.
- **Bundled programs** are pinned by URL and SHA-256 in `desktop/binaries.lock.json` (Dependabot can't bump them). Their licence texts ship next to them. ffmpeg comes from third-party builds for now; a minimal build of our own is planned.
- **The website** (`website/`): static Astro, no JavaScript, self-hosted fonts, a strict content security policy in a `<meta>` tag. Installer links use the fixed file names from `electron-builder.config.mjs` (`website/src/site.ts`). It lives under `/tagtape` on `github.io` until the domain is pointed at it (then: `site`, remove `base`, add `public/CNAME`).
- pnpm settings live in `pnpm-workspace.yaml`. `.npmrc` is for auth only (see the `pnpm` skill).
- Versions used by more than one package (zod, vitest, typescript) go in the pnpm **catalog**. (The website pins TypeScript 6: `astro check` doesn't support 7 yet.)
- Code in `shared/` must run in browsers, Node and React Native: web-standard APIs only (no `node:*` imports, no `Buffer`), relative imports with `.ts` extensions, and erasable TypeScript syntax only.
- Tests are Vitest, written as `*.test.ts` files next to the code they test. Pipeline tests use the fake pipeline in `core/test/helpers.ts` and need no binaries or network.
- **UI** is **shadcn/ui** on the React Aria base (`desktop/components.json`: vega style, green on olive, no radius, Oxanium, lucide icons).
  - `renderer/components/ui/` is vendor code: prefer composing over editing those files.
  - Use theme tokens (`bg-card`, `text-muted-foreground`, `text-primary`), never raw palette colours. Dark mode follows `prefers-color-scheme`.
  - Track reordering stays on dnd-kit: a React Aria GridList is a single Tab stop, and its arrow-key row navigation fights the text inputs inside the rows.
  - Keep inputs accessible: every field has a label and `aria-invalid` plus `aria-describedby` for errors (`components/text-field.tsx`).
  - Form state is a client-side `AlbumDraft` (`lib/album-draft.ts`), validated with `albumInputSchema` before submit. Errors are keyed like `tracks.0.url`.

## CI (`.github/workflows/`)

- **`ci.yml`** runs on pushes to `main`/`dev`, tags and every PR:
  - `checks`: `biome ci`, `pnpm typecheck`, `pnpm test`, `pnpm build`, with a frozen lockfile.
  - `package` (macOS arm64 and x64, Windows, Linux): the desktop tests on that platform, `pnpm package`, then the packaged app started once in smoke mode (`TAGTAPE_SMOKE_TEST=1`). Installers are uploaded as artifacts.
  - `release` (version tags only): a draft GitHub Release with every installer.
- **`pages.yml`** deploys the website from `main` when `website/` or `shared/` changes. Never deploy it from `dev` or PRs.
- **`e2e.yml`** runs weekly (and on demand): real public links through the bundled binaries. Site links come from the repo variable `TAGTAPE_E2E_SITE_URLS`.
- **Dependabot** (`.github/dependabot.yml`) opens weekly grouped PRs against `dev`, with a 7-day cooldown. It skips Node and `@types/node` majors.
- **pnpm supply chain** (`pnpm-workspace.yaml`): `minimumReleaseAge`, `trustPolicy: no-downgrade`, `blockExoticSubdeps` and `strictDepBuilds` are written out explicitly. If `trustPolicy` flags a package, find out why before adding an exception. Security fixes for transitive packages go in `overrides:`, scoped to the vulnerable range, with a comment.
- Actions are pinned to commit SHAs, with the version in a comment. To update one, resolve the new tag's SHA with `git ls-remote`, and prefer releases that are at least a few days old.
- Lint workflows locally with `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7`.

## Git

- **The agent commits each finished step** (one step = one commit), with a message from the `commit-message` skill, after `pnpm check`, typecheck and the tests pass. Split changes that do more than one thing into separate commits.
- New work goes on its own branch, `claude/<topic>`, cut from `dev`.
- **Never push, merge into `dev` or `main`, tag, or rewrite pushed history.** The user does that.

## Skills

Project skills are in `.claude/skills/` (third-party ones tracked by `skills-lock.json`): `electron` (this repo's own rules for the desktop app), `node`, `pnpm`, `vitest`, `commit-message`. TanStack's version-matched skills load through TanStack Intent (block above).
