# Deploying TagTape on Spotcraft

TagTape runs on [Spotcraft](https://spotcraft.dev) (v0.2.0 or later), which runs the image behind HTTPS, gives it a Postgres database and watches it. Spotcraft deploys hosted apps from its dashboard only: there is no deploy workflow in this repo.

What Spotcraft provides, and what TagTape relies on:

- **Caddy in front** with automatic HTTPS, HSTS, `nosniff`, `Referrer-Policy`, and a `www` → apex redirect for two-label domains like `tagtape.app`. It sets `X-Forwarded-For` to the visitor's address (it ignores what the client sent), so `TRUST_PROXY=1` is safe. No write timeout, so ZIP downloads stream for as long as they take.
- **A Postgres database** (`app_tagtape`). Spotcraft creates it and migrates its `auth` schema before the container starts. TagTape migrates its own tables in `public` on first use.
- **The container restrictions** TagTape is built for: read-only root, a 64 MB `noexec` `/tmp`, no capabilities, `no-new-privileges`, 256 PIDs, and a 30 s stop grace period.
- **Health:** a deploy waits up to 120 s for the image's `HEALTHCHECK` (the web app and the internal API), and rolls back to the previous version if it fails.

The app sets the rest itself:
- the nonce-based CSP
- `X-Frame-Options`
- `Cross-Origin-Opener-Policy`
- `Permissions-Policy`
- a 64 KB request body limit (`src/start.ts`)

## 1. Rehearse the release locally

```bash
pnpm docker   # the image, run the way Spotcraft runs it, with Postgres → http://localhost:3000
```

[`docker/compose.local.yaml`](../docker/compose.local.yaml) applies Spotcraft's container settings and provisions the database the way Spotcraft's agent does. Convert a short album, and check that `find /tmp -type f` inside the app container prints nothing during and after the download.

## 2. Create the app (once)

In the Spotcraft dashboard, **New app**:

| Field | Value |
|---|---|
| Name | `tagtape` |
| Image | `vindotski/tagtape` (public on Docker Hub) |
| Tag | a release, e.g. `2.1.0`, or a `sha-abc1234` from `main` |
| Domain | `tagtape.app` |
| Container port | `3000` |
| Memory / CPUs | `1g` / `2` (web, API, up to `MAX_ACTIVE_STREAMS` (2) conversions and `YTDLP_MAX_CHECKS` (3) yt-dlp checks, ~100 MB each, share them) |
| Read-only filesystem | on (the default) |
| Database | ticked: Spotcraft sets `DATABASE_URL`; don't set it yourself |

Environment variables, one `KEY=value` per line:

```
TRUST_PROXY=1
PUBLIC_URL=https://tagtape.app
AUTH_SECRET=<openssl rand -hex 32>
NODE_OPTIONS=--max-old-space-size=384
```

- **`AUTH_SECRET`** signs the guests' session cookies. Generate it once and keep it: changing it signs every guest out, and they lose their album history. Spotcraft stores environment variables in plain text in the app's settings on the apps server, so treat that server's disk accordingly.
- **Tuning** uses the same variables as the API ([README](../README.md#configuration)):
  - the per-client limits: `MAX_JOBS_PER_CLIENT_HOUR`, `MAX_DOWNLOADS_PER_CLIENT`, …
  - the server-wide limits: `MAX_ACTIVE_STREAMS`, …
  - the proof-of-work cost: `POW_COST`
  - `LOG_LEVEL`

Point the domain's DNS at the apps server (A/AAAA for `tagtape.app` and `www`). With Cloudflare DNS, use **DNS only** (grey cloud): its proxy cuts long downloads and would merge every visitor into one rate-limit bucket.

## 3. Deploy a new version

Push `main` (publishes `latest` and `sha-…`) or tag `vX.Y.Z` (publishes `X.Y.Z`), wait for CI's **Publish** job, then edit the app in the dashboard and pick the new tag. Spotcraft pulls it, waits for the health check, and rolls back on failure, showing the app's last log lines.

- **A deploy cuts running downloads.** Spotcraft stops the old container (30 s grace) before starting the new one, and jobs live in memory. Deploy when nobody is downloading; users just retry.
- **Database migrations only add**, in TagTape and in the kit, so a rollback to the previous tag keeps working against the newer schema.
- Keep `@spotcraft/kit` at the version of the Spotcraft you deploy to: the kit refuses to start against an older `auth` schema.

## 4. Test a real conversion (after moving servers)

Convert a short album from the live site, for example the public sample `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3`, plus a freely licensed track from a site yt-dlp supports and a link for each source plugin you run. Logs are on the app's page in the dashboard. Some sites block or rate-limit datacenter IPs; if a plugin's source refuses the server, try another region or provider.

## Guests and their data

- The dashboard's **Users** tab lists the app's guests (created, last seen).
- Deleting one there also deletes their album history (`ON DELETE CASCADE`).
- Guests are created only when someone starts an album, never by page views or crawlers, and at most 30 new guests per address per 10 minutes.

## Rollback

Edit the app and pick the previous tag. Every publish also has an immutable `sha-abc1234` tag on Docker Hub.
