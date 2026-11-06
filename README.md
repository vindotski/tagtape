# TagTape
> Convert YouTube to MP3 with metadata for standard MP3 players.

TagTape is being rewritten with [TanStack Start](https://tanstack.com/start). The original Symfony/PHP app lives in [legacy/](legacy/README.md) for reference.

[tagtape.app](https://tagtape.app)

## Development

Requires Node and pnpm.

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm build    # production build
pnpm check    # Biome lint + format check
```

Routes live in `src/routes`. TanStack Router regenerates `src/routeTree.gen.ts` automatically.

## Meta

[Ivan Vinski](https://www.vin.ski) – ivan@vin.ski

Distributed under the GPL-2.0 license. See [LICENSE](LICENSE) for more information.

[https://github.com/vindotski/tagtape](https://github.com/vindotski/tagtape)
