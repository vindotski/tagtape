<!-- intent-skills:start -->
# TanStack Intent - before editing files, run the matching guidance command.
tanstackIntent:
  - id: "@tanstack/react-router#react-router"
    run: "pnpm exec intent load @tanstack/react-router#react-router"
    for: "React bindings for TanStack Router: RouterProvider, useRouter, useRouterState, useMatch, useMatches, useLocation, useSearch, useParams, useNavigate, useLoaderData, useLoaderDeps, useRouteContext, useBlocker, useCanGoBack, Link, Navigate, Outlet, CatchBoundary, ErrorComponent. React-specific patterns for hooks, providers, SSR hydration, and createLink with forwardRef."
  - id: "@tanstack/router-core#router-core"
    run: "pnpm exec intent load @tanstack/router-core#router-core"
    for: "Framework-agnostic core concepts for TanStack Router: route trees, createRouter, createRoute, createRootRoute, createRootRouteWithContext, addChildren, Register type declaration, route matching, route sorting, file naming conventions. Entry point for all router skills."
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
  - id: "@tanstack/router-core#router-core/type-safety"
    run: "pnpm exec intent load @tanstack/router-core#router-core/type-safety"
    for: "Full type inference philosophy (never cast, never annotate inferred values), Register module declaration, from narrowing on hooks and Link, strict:false for shared components, getRouteApi for code-split typed access, addChildren with object syntax for TS perf, LinkProps and ValidateLinkOptions type utilities, as const satisfies pattern."
  - id: "@tanstack/router-plugin#router-plugin"
    run: "pnpm exec intent load @tanstack/router-plugin#router-plugin"
    for: "TanStack Router bundler plugin for route generation and automatic code splitting. Supports Vite, Webpack, Rspack, and esbuild. Configures autoCodeSplitting, routesDirectory, target framework, and code split groupings."
<!-- intent-skills:end -->

# TagTape — agent instructions

TagTape turns 1–10 track links plus album details (title, artist, genre, year, cover) into a folder of ID3-tagged MP3s laid out as an album, so the tracks sort and display correctly on any plain MP3 player. It is a desktop app (Electron) that runs entirely on the user's computer: no server, no accounts. Out of the box it reads direct links to MP3 files and, through the bundled yt-dlp, single tracks from any site yt-dlp has an extractor for; more sources can come from plugins. https://tagtape.app

Versions 2 and 3 were a hosted web app (TanStack Start + a Fastify API in one Docker image); that code ends at tag `v3.2.0`. Version 1 was a 2020 PHP app (tag `v1.0.0`).

## Repo layout

| Path | What |
|---|---|
| `apps/desktop/` | `@tagtape/desktop`: the Electron app (electron-vite, electron-builder). |
| `apps/desktop/src/main/` | Main process: window, IPC handlers (`ipc.ts`), the local library (`library.ts`), the application menu (`menu.ts`), the remembered window place (`window-state.ts`). |
| `apps/desktop/src/preload/` | The sandboxed bridge that exposes `window.tagtape`. |
| `apps/desktop/src/renderer/` | The React UI (TanStack Router, hash history; shadcn/ui on React Aria). |
| `apps/desktop/src/core/` | The pipeline: jobs, sources, plugins, process handling, the album-folder writer. No Electron imports; tested in plain Node. |
| `apps/desktop/src/ipc.ts` | The contract between page and main process (types + channel names). |
| `apps/website/` | `@tagtape/website`: the static Astro product site, deployed to GitHub Pages. |
| `packages/shared/` | `@tagtape/shared`: zod schemas, limits, `parseWebUrl`, the ID3v2.3 writer, file naming, probe rules, yt-dlp error mapping, the share format. Exports TS source directly. |

How the parts talk: the page calls `window.tagtape` (see `renderer/lib/bridge.ts`); the preload forwards each call over IPC; the main process validates the arguments and calls the pipeline (`createTagTape` in `core/index.ts`). For anything Electron-specific, load the `electron` skill first.

**Versioning and releases:**
- **One version** for everything: the root `package.json` `"version"`. The app reads it at build time (`__APP_VERSION__`), and electron-builder uses it.
- **Released so far:** 2.0.0 (2026-11-06), 3.0.0 (2026-11-08), 3.1.0 and 3.2.0 (2026-11-13), all the hosted web app. **4.0.0 is the desktop app** (not released yet; `package.json` already says 4.0.0 so builds don't call themselves 3.2.0).
- New work goes under `## Unreleased` in `CHANGELOG.md`, without a version bump.
- At release time the user picks the version (semver). Bump `package.json` (if it isn't that version already), rename `## Unreleased` to the version and date, commit, merge to `main`, and the user tags `vX.Y.Z`.
- A `vX.Y.Z` tag (it must match `package.json`, or CI fails) makes CI attach every installer and a `SHA256SUMS.txt` to a **draft** GitHub Release. The user publishes it; the website links to the latest published release.
- **Branches:** `dev` is the working branch and GitHub's default branch (PRs target it); `main` is production (the website deploys from it). Only the user merges, pushes and tags.
- Installers are **unsigned** for now (macOS: ad-hoc). The website explains how to open them.
- The packaged Electron binary has **fuses** set (`electronFuses` in `electron-builder.config.mjs`): no `--inspect`, no `NODE_OPTIONS`, code only from the app archive. `runAsNode` stays on, for yt-dlp's JavaScript runtime. So a packaged app can't be debugged through the main-process inspector; use a dev build.

## Commands (pnpm only)

The app runs on the host (Electron needs a display); Node 26 and pnpm are the only things it needs installed. ffmpeg and yt-dlp are fetched into the repo by a script, never installed system-wide.

```bash
pnpm install
pnpm binaries      # fetch the pinned ffmpeg and yt-dlp for this platform (checksum-verified)
pnpm dev           # the desktop app with hot reload
pnpm build         # build the app's code and the website
pnpm package       # installers for this platform, in apps/desktop/dist
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
    - **No cookies, logins or account features, and never anything that gets around DRM** (refuse with a clear message). **No yt-dlp plugins** either: `--no-plugin-dirs`, so nothing in the user's own yt-dlp folders changes what the app does.
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
- **Limits** (`LIMITS` in `core/options.ts`) are a single user's: a check timeout, a per-source timeout, how many tracks are checked at once. Don't bring back queue sizes, time-to-live sweeps or other caps a public server needed.
- **The local library** (`main/library.ts`): one JSON file in the app's data folder with the last 50 albums as typed (details, track titles and links, the cover's URL), where each was saved, and the save folder; next to it, `covers/<album id>.jpg`, a 320 px copy of each album's cover. **Never media.** Atomic writes, one at a time. Failures never block an album. A cover goes when its album does. A file that can't be fully read is copied to `library.json.unreadable` before it is replaced; entries are checked one by one, so one bad entry never costs the rest.
  - The page gets covers and folders **by album id only** (`albumCover` returns a `data:` URL, so the page's security policy needs no new image source).
- **Sharing** (`packages/shared/src/share.ts`): an album travels as a `.tagtape` JSON file or inside a link's fragment (`…/open/#a=<base64url>`, or `tagtape://open#a=…`). It holds what was typed (details, track titles and links, the cover's URL), **never media**, and there is **no public list of shared albums** anywhere (that would have the website naming sites).
  - Whatever arrives is untrusted: it is decoded with `decodeShare` / `albumFromFragment` (the album form's schema, a size cap, never a throw) and **only ever shown in the editor** (`/shared`). Nothing starts by itself, and it reaches the library only when the user makes it.
  - Ways in (`main/open-share.ts`, `main/index.ts`): File > Open Album File, macOS `open-file` / `open-url`, the command line on Windows and Linux (first start and `second-instance`), and a file dropped on the window (read by the page itself).
  - Out: `shareAlbum` in `main/ipc.ts`, by album id. The link's address is `LINKS.open` in `main/links.ts`.
- **Bundled programs** are pinned by URL and SHA-256 in `apps/desktop/binaries.lock.json` (Dependabot can't bump them). Their licence texts ship next to them. The macOS ffmpeg build is GPL-3.0-or-later, the Windows and Linux ones LGPL: a known difference until the build of our own. Licences of the npm code inside the app are collected at build time (`scripts/notices-plugin.ts`) and ship in the app's `licenses` folder with the programs' (Help > Third-Party Licences); a dependency that reaches the app some way the bundler doesn't see (CSS, native code) must be named in `electron.vite.config.ts`. ffmpeg comes from third-party builds for now; a minimal build of our own is planned.
- **The website** (`apps/website/`): static Astro, self-hosted fonts, a strict content security policy in a `<meta>` tag. **No JavaScript, except on `/open/`**, the page share links land on: it runs one self-hosted script (`src/scripts/open.ts`) that reads the album from the address, makes no requests, and sets text only, never HTML. A page gets scripts only by passing `scripts` to `layouts/Page.astro`. Installer links use the fixed file names from `electron-builder.config.mjs` (`apps/website/src/site.ts`). It lives under `/tagtape` on `github.io` until the domain is pointed at it (then: `site`, remove `base`, add `public/CNAME`).
- pnpm settings live in `pnpm-workspace.yaml`. `.npmrc` is for auth only (see the `pnpm` skill).
- Versions used by more than one package (zod, vitest, typescript) go in the pnpm **catalog**. (The website pins TypeScript 6: `astro check` doesn't support 7 yet.)
- Code in `packages/shared/` must run in browsers (the website's open page) and Node: web-standard APIs only (no `node:*` imports, no `Buffer`), relative imports with `.ts` extensions, and erasable TypeScript syntax only.
- Tests are Vitest, written as `*.test.ts` files next to the code they test. Pipeline tests use the fake pipeline in `core/test/helpers.ts` and need no binaries or network.
- **UI** is **shadcn/ui** on the React Aria base (`apps/desktop/components.json`: vega style, green on olive, no radius, Oxanium, lucide icons).
  - **It is a desktop window, not a web page.** The root route (`routes/__root.tsx`) is the whole window: the sidebar (`components/app-sidebar.tsx`), a strip that stands in for the title bar and drags the window (`.app-drag` in `styles.css`), and a screen that scrolls on its own. The window itself never scrolls. Chrome is `select-none`; add `select-text` where text should be copyable.
  - Screens: `/` (new album, and the album being made), `/albums` (library), `/albums/$albumId` (an album), `/albums/$albumId/edit` (make it again), `/shared` (an album someone shared), `/settings`.
  - Imports inside the renderer use the `#/` alias (`#/components/…`, `#/lib/…`). `routeTree.gen.ts` is generated by the router plugin: never edit it; a new file in `routes/` is picked up by `pnpm dev` or `pnpm build`.
  - **One album is made at a time.** The pipeline refuses a second (`busy`), and the page follows the one in progress outside any screen (`lib/current-job.ts`): the first screen shows it, the sidebar says so everywhere. Never keep a job's id in one screen's state.
  - Anything the system does better stays native, in the main process: the application menu, right-click menus, confirm dialogs, notifications, the dock/taskbar progress. The main process changes the screen only through the one `navigate` event (`Screen` in `apps/desktop/src/ipc.ts`).
  - `renderer/components/ui/` is vendor code: prefer composing over editing those files.
  - Use theme tokens (`bg-card`, `text-muted-foreground`, `text-primary`), never raw palette colours. Dark mode follows `prefers-color-scheme`.
  - Track reordering stays on dnd-kit: a React Aria GridList is a single Tab stop, and its arrow-key row navigation fights the text inputs inside the rows.
  - Keep inputs accessible: every field has a label and `aria-invalid` plus `aria-describedby` for errors (`components/text-field.tsx`).
  - Form state is a client-side `AlbumDraft` (`lib/album-draft.ts`), validated with `albumInputSchema` before submit. Errors are keyed like `tracks.0.url`.

## CI (`.github/workflows/`)

- **`ci.yml`** runs on pushes to `main`/`dev`, tags and every PR:
  - `checks`: `biome ci`, `pnpm typecheck`, `pnpm test`, `pnpm build`, with a frozen lockfile.
  - `package` (macOS arm64 and x64, Windows, Linux; on a PR only when it touches the app, the shared package, the lockfile, the workspace files or `ci.yml`): the desktop tests on that platform, `pnpm package`, then the packaged app started once in smoke mode (`TAGTAPE_SMOKE_TEST=1`). Installers are uploaded as artifacts.
  - `release` (version tags only): a draft GitHub Release with every installer.
- **`pages.yml`** deploys the website from `main` when `apps/website/` or `packages/shared/` changes. Never deploy it from `dev` or PRs.
- **`e2e.yml`** runs weekly (and on demand): real public links through the bundled binaries. Every link comes from a repository variable, never the repo: `TAGTAPE_E2E_MP3_URLS` and `TAGTAPE_E2E_COVER_URL` (direct links), `TAGTAPE_E2E_SITE_URLS` (yt-dlp). A part without its variable is skipped.
- The app writes a log to `logs/main.log` in its data folder (`main/log.ts`; Help > Show Logs). Use the `log` object in main, never bare `console`, for anything worth finding later.
- The pnpm store cache is **restored on every run but saved only from `dev` and `main`** (one copy per PR overfilled GitHub's 10 GB limit). Don't add `cache: pnpm` back to `setup-node` in `ci.yml`.
- **Dependabot** (`.github/dependabot.yml`) opens weekly grouped PRs against `dev`, with a 7-day cooldown. It skips Node and `@types/node` majors.
- **pnpm supply chain** (`pnpm-workspace.yaml`): `minimumReleaseAge`, `trustPolicy: no-downgrade`, `blockExoticSubdeps` and `strictDepBuilds` are written out explicitly. If `trustPolicy` flags a package, find out why before adding an exception. Security fixes for transitive packages go in `overrides:`, scoped to the vulnerable range, with a comment.
- Actions are pinned to commit SHAs, with the version in a comment. To update one, resolve the new tag's SHA with `git ls-remote`, and prefer releases that are at least a few days old.
- Lint workflows locally with `docker run --rm -v "$PWD:/repo" -w /repo rhysd/actionlint:1.7.7`.

## Git

- **The agent commits each finished step** (one step = one commit), with a message from the `commit-message` skill, after `pnpm check`, typecheck and the tests pass. Split changes that do more than one thing into separate commits.
- New work goes on its own branch, `claude/<topic>`, cut from `dev`.
- **Never push, merge into `dev` or `main`, tag, or rewrite pushed history.** The user does that.

## Skills

Project skills are in `.claude/skills/` (third-party ones tracked by `skills-lock.json`): `electron` (this repo's own rules for the desktop app), `pnpm`, `vitest`, `commit-message`. TanStack's version-matched skills load through TanStack Intent (block above).
