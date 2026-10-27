#!/usr/bin/env bash
# Rebuilds and restarts the hosted service. GitHub Actions runs this over SSH after
# every push to main (.github/workflows/deploy.yml), always after `git pull`, so it
# is the version from the commit being deployed. See docs/DEPLOY.md.
set -euo pipefail

main() {
  cd "$(dirname "$0")"
  # One deploy at a time: a second push waits for GitHub's queue, not here.
  exec 9>/tmp/telenotify-deploy.lock
  flock -n 9 || { echo "Another deploy is already running" >&2; exit 1; }

  echo "Deploying $(git rev-parse --short HEAD): $(git log -1 --format=%s)"
  COMPOSE_PARALLEL_LIMIT=1 docker compose -f docker-compose.vps.yml build
  docker compose -f docker-compose.vps.yml up -d
  docker compose -f docker-compose.vps.yml ps
  # Old image layers pile up with every build; keep the disk from filling.
  docker image prune -f >/dev/null
}

main "$@"
