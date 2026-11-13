---
name: electron
description: TagTape's own rules for its Electron desktop app (apps/desktop/). Use when adding or changing anything the window can ask the app to do (IPC), touching the main or preload process, the window's security settings, the bundled ffmpeg and yt-dlp, packaging with electron-builder, or when the app needs to be run, driven and checked for real.
---

# TagTape's Electron app

The app is three parts with one narrow door between them:

| Part | Where | May use |
|---|---|---|
| Main process | `apps/desktop/src/main` | Node, Electron, the pipeline (`apps/desktop/src/core`) |
| Preload | `apps/desktop/src/preload/index.ts` | `contextBridge`, `ipcRenderer`; nothing else |
| Page (renderer) | `apps/desktop/src/renderer` | The browser, and `window.tagtape` |

`apps/desktop/src/core` never imports Electron: it is tested in plain Node.

## Adding something the page can ask for

One call takes four small edits, always all four:

1. **Contract:** add the method to `TagTapeApi` and its channel to `CHANNELS` in `apps/desktop/src/ipc.ts`.
2. **Preload:** forward it with `ipcRenderer.invoke` in `apps/desktop/src/preload/index.ts`.
3. **Main:** add the handler in `apps/desktop/src/main/ipc.ts`. Arguments arrive as `unknown`: **validate every one with zod** before use. The page is the less trusted side.
4. **Page:** add a wrapper in `apps/desktop/src/renderer/lib/bridge.ts`; components import from there, never `window.tagtape` directly.

Rules for handlers:

- Never take a file path from the page. Pass an id and look the path up in main (see `showJobFolder`).
- Never expose `ipcRenderer`, `shell`, `fs` or a generic "invoke" to the page.
- Return plain data (it is structured-cloned). Errors the user should see are returned as messages, not thrown.

## When main needs the page to do something

Main sends the page exactly one message: `NAVIGATE`, carrying a `Screen` (`apps/desktop/src/ipc.ts`), which names a screen to show. The menu and notifications use it through `showScreen()` in `main/index.ts`; the page listens in `routes/__root.tsx`. Don't add other main-to-page messages: if the page needs data, it asks (a call), and after a change it reloads through `router.invalidate()`.

Native things stay in main: the application menu (`main/menu.ts`), right-click menus (`context-menu` in `main/index.ts`, `albumMenu` in `main/ipc.ts`), confirm dialogs, notifications and the dock/taskbar progress (both driven by `tagtape.subscribe`).

## Files and links that open the app

Shared albums (`.tagtape` files, `tagtape://` links; the format is in `packages/shared/src/share.ts`) reach `openShare()` in `main/index.ts` from: the File menu, macOS `open-file` / `open-url` (registered before the app is ready, and held until it is), and the command line on Windows and Linux (`shareTargetIn` on the first start and on `second-instance`). The installers register both (`fileAssociations`, `protocols` in `electron-builder.config.mjs`); in development nothing is registered, so pass the file or link as an argument. The preload keeps a `navigate` message that arrives before the page listens. An AppImage registers nothing by itself.

To check on macOS with the packaged app and a scratch profile: `open -n -a <TagTape.app> <file> --args --user-data-dir=<scratch>`, then `open <file or link>` again while it runs.

## The title bar

The page draws the top of the window. macOS uses `titleBarStyle: "hiddenInset"` (the sidebar leaves room for the traffic lights), Windows `titleBarStyle: "hidden"` with `titleBarOverlay` (the top strip leaves room on the right; the overlay's colours follow light/dark), and Linux keeps the system's title bar. The page learns the system from `window.tagtape.platform`. Elements with `.app-drag` move the window; controls inside them opt out automatically, and `.app-no-drag` opts anything else out.

## Window security (don't loosen)

Set in `apps/desktop/src/main/index.ts` and `apps/desktop/electron.vite.config.ts`:

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- The window can't navigate away or open windows; http(s) links open in the system browser.
- Every permission request is refused.
- The built page carries a content security policy as a `<meta>` tag (a `file://` page has no headers). A new script, style, font, image host or connection means changing that policy on purpose; prefer bundling the asset.
- The preload script must stay CommonJS (`index.cjs`): a sandboxed preload can't be an ES module.

## Bundled programs

- `apps/desktop/binaries.lock.json` pins ffmpeg and yt-dlp per platform by URL and SHA-256. `pnpm binaries` fetches them into `apps/desktop/resources/bin/<platform>-<arch>/` (git-ignored).
- To bump one: change the URL and take the checksum from the publisher's own sums file, never from the download you just made.
- Main resolves them with `binaryPaths()` (`core/lib/binaries.ts`): the repo folder in development, `process.resourcesPath` when packaged.
- yt-dlp's JavaScript runtime is Electron's own binary, started as Node (`ELECTRON_RUN_AS_NODE=1`). Don't bundle another runtime.
- External programs are spawned only through `core/lib/exec.ts` (argument arrays, minimal environment, whole process tree killed on cancel).

## Running and checking it

```bash
pnpm binaries        # once, and after changing binaries.lock.json
pnpm dev             # the app with hot reload
pnpm package         # installers for this platform in apps/desktop/dist
```

Check real behaviour in the real window, not only in tests:

- Start the built app with a debugging port and a scratch profile, so nothing touches the user's own data or Downloads folder:
  `apps/desktop/node_modules/.bin/electron apps/desktop --remote-debugging-port=9333 --user-data-dir=<scratch dir>`
  Put a `library.json` with `{"version":1,"destination":"<scratch dir>","albums":[]}` in that profile first.
- To act as the main process (click a menu item, read what was sent to the dock), also pass `--inspect=9229` and use `Runtime.evaluate` with `includeCommandLineAPI: true` on that port: `require("electron")` works there.
- The window is real and on the user's screen while you test: say so, and expect clicks that aren't yours.
- Drive it over the DevTools protocol (`http://127.0.0.1:9333/json/list`, then `Runtime.evaluate` and `Page.captureScreenshot` on the page's WebSocket). React inputs need the native value setter plus an `input` event.
- A packaged build has a smoke mode: `TAGTAPE_SMOKE_TEST=1 <app executable>` prints `SMOKE OK …` and exits 0 when the page rendered and both programs ran.
- After changing the pipeline: `TAGTAPE_E2E=1 pnpm --filter @tagtape/desktop exec vitest run src/core/e2e.test.ts`, then make an album in the window, cancel one mid-save, and confirm the chosen folder holds no `.part` file or empty album folder.

## Packaging

- `apps/desktop/electron-builder.config.mjs`. The version comes from the root `package.json`.
- Installer file names are fixed (`TagTape-mac-arm64.dmg`, …): the website links to them. Renaming one means changing `apps/website/src/site.ts` too.
- The bundled programs are excluded from macOS signing (`signIgnore`): they arrive signed by their publishers, and yt-dlp's embedded Python can't be re-signed.
- sharp's platform packages are listed as `optionalDependencies` of `apps/desktop/package.json`, because pnpm doesn't hoist them for electron-builder. Keep their versions equal to sharp's own.
