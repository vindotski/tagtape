#!/usr/bin/env bash
# Runs ON the server (piped over ssh by .github/workflows/deploy.yml, or run by
# hand: `TAG=2.0.0 bash remote-deploy.sh` in /opt/tagtape).
# Pins TAGTAPE_TAG in .env, pulls, restarts, and waits until healthy.
set -euo pipefail

: "${TAG:?TAG is required, e.g. TAG=2.0.0}"
if [[ ! "$TAG" =~ ^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$ ]]; then
	echo "Invalid image tag: $TAG" >&2
	exit 1
fi
cd "${TAGTAPE_DIR:-/opt/tagtape}"

if [ ! -f .env ]; then
	echo "Missing $(pwd)/.env. Create it from deploy/.env.example first (see docs/deploy.md)." >&2
	exit 1
fi

previous="$(sed -n 's/^TAGTAPE_TAG=//p' .env)"
if grep -q '^TAGTAPE_TAG=' .env; then
	sed -i.bak "s/^TAGTAPE_TAG=.*/TAGTAPE_TAG=${TAG}/" .env
else
	echo "TAGTAPE_TAG=${TAG}" >> .env
fi
echo "Deploying ${TAG} (was: ${previous:-none})"

docker compose pull --quiet
# --wait returns once the app's HEALTHCHECK passes (web page + internal API).
if ! docker compose up -d --remove-orphans --wait --wait-timeout 180; then
	echo "Not healthy; app logs:" >&2
	docker compose logs --tail 100 app >&2 || true
	exit 1
fi

docker image prune -f > /dev/null
docker compose ps
