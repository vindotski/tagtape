# TagTape
> Convert YouTube to MP3 with metadata for standard MP3 players.

TagTape is being rewritten with [TanStack Start](https://tanstack.com/start). The original Symfony/PHP app lives in [legacy/](legacy/README.md) for reference.

[tagtape.app](https://tagtape.app)

## Development

pnpm monorepo. Requires Node 24+ and pnpm 12.

| Path | What |
|---|---|
| `apps/web` | TanStack Start web app |
| `apps/api` | Fastify service: yt-dlp, ffmpeg, tagging, zipping *(in progress)* |
| `packages/shared` | zod schemas and types shared by web and API |
| `legacy/` | Original Symfony app, kept for reference |

```bash
pnpm install
pnpm dev        # all apps; web on http://localhost:3000
pnpm build
pnpm typecheck
pnpm check      # Biome lint + format (pnpm fix to apply)
```

Web routes live in `apps/web/src/routes`. TanStack Router regenerates `routeTree.gen.ts` automatically.

## Meta

[Ivan Vinski](https://www.vin.ski) – ivan@vin.ski

Distributed under the GPL-2.0 license. See [LICENSE](LICENSE) for more information.

[https://github.com/vindotski/tagtape](https://github.com/vindotski/tagtape)
