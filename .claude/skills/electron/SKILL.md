---
name: electron
description: TagTape's own rules for its Electron desktop app (desktop/). Use when adding or changing anything the window can ask the app to do (IPC), touching the main or preload process, the window's security settings, the bundled ffmpeg and yt-dlp, packaging with electron-builder, or when the app needs to be run, driven and checked for real.
---

# TagTape's Electron app

The app is three parts with one narrow door between them:

| Part | Where | May use |
|---|---|---|
| Main process | `desktop/src/main` | Node, Electron, the pipeline (`desktop/src/core`) |
| Preload | `desktop/src/preload/index.ts` | `contextBridge`, `ipcRenderer`; nothing else |
| Page (renderer) | `desktop/src/renderer` | The browser, and `window.tagtape` |

`desktop/src/core` never imports Electron: it is tested in plain Node.

## Adding something the page can ask for

One call takes four small edits, always all four:

1. **Contract:** add the method to `TagTapeApi` and its channel to `CHANNELS` in `desktop/src/ipc.ts`.
2. **Preload:** forward it with `ipcRenderer.invoke` in `desktop/src/preload/index.ts`.
3. **Main:** add the handler in `desktop/src/main/ipc.ts`. Arguments arrive as `unknown`: **validate every one with zod** before use. The page is the less trusted side.
4. **Page:** add a wrapper in `desktop/src/renderer/lib/bridge.ts`; components import from there, never `window.tagtape` directly.

Rules for handlers:

- Never take a file path from the page. Pass an id and look the path up in main (see `showJobFolder`).
- Never expose `ipcRenderer`, `shell`, `fs` or a generic "invoke" to the page.
- Return plain data (it is structured-cloned). Errors the user should see are returned as messages, not thrown.

## Window security (don't loosen)

Set in `desktop/src/main/index.ts` and `desktop/electron.vite.config.ts`:

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- The window can't navigate away or open windows; http(s) links open in the system browser.
- Every permission request is refused.
- The built page carries a content security policy as a `<meta>` tag (a `file://` page has no headers). A new script, style, font, image host or connection means changing that policy on purpose; prefer bundling the asset.
- The preload script must stay CommonJS (`index.cjs`): a sandboxed preload can't be an ES module.

## Bundled programs

- `desktop/binaries.lock.json` pins ffmpeg and yt-dlp per platform by URL and SHA-256. `pnpm binaries` fetches them into `desktop/resources/bin/<platform>-<arch>/` (git-ignored).
- To bump one: change the URL and take the checksum from the publisher's own sums file, never from the download you just made.
- Main resolves them with `binaryPaths()` (`core/lib/binaries.ts`): the repo folder in development, `process.resourcesPath` when packaged.
- yt-dlp's JavaScript runtime is Electron's own binary, started as Node (`ELECTRON_RUN_AS_NODE=1`). Don't bundle another runtime.
- External programs are spawned only through `core/lib/exec.ts` (argument arrays, minimal environment, whole process tree killed on cancel).

## Running and checking it

```bash
pnpm binaries        # once, and after changing binaries.lock.json
pnpm dev             # the app with hot reload
pnpm package         # installers for this platform in desktop/dist
```

Check real behaviour in the real window, not only in tests:

- Start the built app with a debugging port and a scratch profile, so nothing touches the user's own data or Downloads folder:
  `desktop/node_modules/.bin/electron desktop --remote-debugging-port=9333 --user-data-dir=<scratch dir>`
  Put a `library.json` with `{"version":1,"destination":"<scratch dir>","albums":[]}` in that profile first.
- Drive it over the DevTools protocol (`http://127.0.0.1:9333/json/list`, then `Runtime.evaluate` and `Page.captureScreenshot` on the page's WebSocket). React inputs need the native value setter plus an `input` event.
- A packaged build has a smoke mode: `TAGTAPE_SMOKE_TEST=1 <app executable>` prints `SMOKE OK …` and exits 0 when the page rendered and both programs ran.
- After changing the pipeline: `TAGTAPE_E2E=1 pnpm --filter @tagtape/desktop exec vitest run src/core/e2e.test.ts`, then make an album in the window, cancel one mid-save, and confirm the chosen folder holds no `.part` file or empty album folder.

## Packaging

- `desktop/electron-builder.config.mjs`. The version comes from the root `package.json`.
- Installer file names are fixed (`TagTape-mac-arm64.dmg`, …): the website links to them. Renaming one means changing `website/src/site.ts` too.
- The bundled programs are excluded from macOS signing (`signIgnore`): they arrive signed by their publishers, and yt-dlp's embedded Python can't be re-signed.
- sharp's platform packages are listed as `optionalDependencies` of `desktop/package.json`, because pnpm doesn't hoist them for electron-builder. Keep their versions equal to sharp's own.
