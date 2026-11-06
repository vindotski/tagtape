# Deploying TagTape to a server

TagTape runs as one Docker image (`vindotski/tagtape`) behind [Caddy](https://caddyserver.com), which handles HTTPS. The setup is **provider-neutral**. It works on any Linux VM where you can paste cloud-init "user data" when creating the server: DigitalOcean, Hetzner, Vultr, Linode/Akamai, AWS EC2, and others. Everything needed to rebuild the server lives in [`deploy/`](../deploy):

| File | What it does |
|---|---|
| [`cloud-init.yaml`](../deploy/cloud-init.yaml) | First-boot setup: Docker, a `deploy` user for CI (gets the SSH keys you chose, wherever your provider put them), firewall (SSH/80/443 only), key-only SSH, automatic security updates, log rotation |
| [`compose.yaml`](../deploy/compose.yaml) | The app + Caddy. Only Caddy publishes ports. Both have health checks. |
| [`Caddyfile`](../deploy/Caddyfile) | HTTPS for your domain (Let's Encrypt), `www` → apex redirect, security headers |
| [`.env.example`](../deploy/.env.example) | Server settings: domain, image tag, tuning |
| [`remote-deploy.sh`](../deploy/remote-deploy.sh) | Runs on the server: pins the tag, pulls, restarts, waits until healthy |

Deploys run from GitHub Actions ([`deploy.yml`](../.github/workflows/deploy.yml)), triggered by hand with an image tag. Because the setup is reproducible, **switching providers, moving servers or getting a new IP** means creating a new server from the same files, then running a deploy.

> ⚠️ Some sites block or rate-limit datacenter IPs. If you run source plugins, test a real conversion on every new server (step 6).

## 1. Create the server

**Any provider:**
- **OS:** Ubuntu 24.04 LTS (recommended), Ubuntu 22.04, or Debian 12/13
- **CPU:** amd64 or arm64; the image supports both
- **Size:** about **2 vCPU / 4 GB**, enough for 2 downloads converting at once (see `MAX_ACTIVE_STREAMS`)
- **Login:** an SSH key, not a password
- **User data:** paste the whole of [`deploy/cloud-init.yaml`](../deploy/cloud-init.yaml) into the provider's **user data / cloud-init** field

Where that field is, and what else to check:

| Provider | User-data field (in the create form) | Also check |
|---|---|---|
| DigitalOcean | **Startup scripts**, under *Additional Options* | Optional Reserved IP, so the address survives replacing the Droplet |
| Hetzner Cloud | **Cloud config** | ARM (CAX) servers work too |
| Linode / Akamai | **Add User Data** (the image must support Metadata; check Akamai's distribution list) | |
| AWS EC2 | **User data**, under *Advanced details* | The **security group must allow** inbound 22/tcp (ideally only your IP and GitHub's), 80/tcp, 443/tcp and 443/udp |
| Vultr / others | See your provider's docs for "cloud-init user data" | Any provider firewall must allow 22, 80, 443 (tcp) and 443/udp |

Labels change over time. If your provider calls the field something else, look for "user data" or "cloud-init". If a provider doesn't support cloud-init at all, run the `runcmd` steps from `cloud-init.yaml` by hand as root.

Give it a few minutes after boot. Then this should work:

```bash
ssh deploy@<server-ip> docker version
```

There are two accounts, both key-only:
- **`deploy`** runs the app. It's in the `docker` group, which is effectively root-equivalent, so guard its key.
- **The provider's admin account** is for admin work like reboots and upgrades. It's usually `root`; on Ubuntu images for AWS it's usually `ubuntu`, with `sudo`.

If something looks wrong, read `/var/log/cloud-init-output.log`. A missing SSH key shows up there as a `WARNING`.

## 2. Point DNS at it

At your DNS provider, add:

| Type | Name | Value |
|---|---|---|
| A | `tagtape.app` | server IPv4 |
| A | `www` | server IPv4 |
| AAAA | `tagtape.app`, `www` | server IPv6 (if it has one) |

If your DNS is on Cloudflare, set these records to **DNS only** (grey cloud), at least for the first deploy, so Caddy can get its certificate directly.

## 3. Server settings

```bash
ssh deploy@<server-ip>
cd /opt/tagtape
nano .env     # paste deploy/.env.example and set TAGTAPE_DOMAIN
```

The deploy workflow copies `compose.yaml` and `Caddyfile` on every deploy and only changes `TAGTAPE_TAG` in `.env`.

**Abuse limits.** Per-client limits use the browser's address, which the app takes from Caddy's `X-Forwarded-For` header (`TRUST_PROXY=1` is set in `compose.yaml`: only Caddy can reach the app). If you put another proxy or CDN in front of Caddy, make Caddy trust it (`trusted_proxies`), or every visitor will look like that proxy and share one set of limits. The defaults, all overridable in `.env`: 30 albums per hour, 2 being checked and 2 downloads at once per address, 5 downloads per album, and an invisible proof-of-work of about a second per album (`POW_COST`).

## 4. GitHub setup (once)

In the repository, go to **Settings → Environments → New environment** `production` and, optionally, add yourself as a required reviewer. Then, in that environment (or under repository settings), add:

| Kind | Name | Value |
|---|---|---|
| Variable | `DEPLOY_HOST` | server IP or hostname |
| Variable | `TAGTAPE_DOMAIN` | `tagtape.app` |
| Variable | `DEPLOY_USER` | `deploy` (optional, this is the default) |
| Secret | `DEPLOY_SSH_KEY` | a **private** key whose public half is in `/home/deploy/.ssh/authorized_keys` |
| Secret | `DEPLOY_KNOWN_HOSTS` | the output of `ssh-keyscan -t ed25519 <server-ip>` |

Generate a dedicated key for CI instead of reusing your personal one:

```bash
ssh-keygen -t ed25519 -f tagtape-deploy -N "" -C "github-actions-deploy"
ssh deploy@<server-ip> 'cat >> ~/.ssh/authorized_keys' < tagtape-deploy.pub
# paste the contents of tagtape-deploy into DEPLOY_SSH_KEY, then delete the local file
```

Verify `DEPLOY_KNOWN_HOSTS` from a network you trust. Pinning the host key is what stops a man-in-the-middle from impersonating the server. **When you replace the server**, update `DEPLOY_HOST` and `DEPLOY_KNOWN_HOSTS`.

## 5. Deploy

Go to **Actions → Deploy → Run workflow** and enter a tag (for example `2.0.0`). The workflow:

1. checks that the tag exists on Docker Hub
2. uploads `compose.yaml` and `Caddyfile`
3. runs `remote-deploy.sh`, which sets the tag, pulls, runs `docker compose up --wait`, and fails if the app or Caddy isn't healthy (the app's logs are printed)
4. loads `https://<domain>/` and its stylesheet **from outside**

The first deploy also issues the HTTPS certificate, which can take up to a minute.

## 6. Test a real conversion (every new server)

Open the site and convert a short album, for example a public MP3 such as `https://archive.org/download/testmp3testfile/mpthreetest.mp3` (12 s), plus a link for each source plugin you run. If a track fails, check the logs:

```bash
ssh deploy@<server-ip> 'cd /opt/tagtape && docker compose logs --tail 50 app'
```

If a site refuses the server's IP (rate limits, bot checks), options, cheapest first:
- a new IP or server
- another region
- another provider (the same files work)

## Rollback

Run the Deploy workflow with the previous tag. Every publish also has an immutable `sha-abc1234` tag on Docker Hub. On the server, `grep TAGTAPE_TAG /opt/tagtape/.env.bak` shows the tag that was running before.

## Day to day

```bash
ssh deploy@<server-ip>
cd /opt/tagtape
docker compose ps                 # both services should be "healthy"
docker compose logs -f app        # app + API logs (JSON)
docker compose logs -f caddy      # HTTPS / certificate issues
TAG=2.0.0 bash remote-deploy.sh   # manual deploy (copy the script over first)
```

- **Updates:** security updates install automatically. Reboot occasionally for kernel updates (as the admin account: `reboot`, or `sudo reboot`); Docker starts on boot and the containers come back by themselves (`restart: unless-stopped`).
- **Restarts stop running downloads.** Nothing is stored: tracks convert while the ZIP streams, and jobs live in memory. Deploy when nobody is downloading; users just retry.
