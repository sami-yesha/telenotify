#!/usr/bin/env bash
# Rebuilds and restarts the hosted service. Run it by hand on the server, after
# `git pull`, so it is the version from the commit being deployed. See the README.
set -euo pipefail

# The public live demo (examples/live-demo) and the address it's served at.
DEMO_DIR=../examples/live-demo
DEMO_DOMAIN=${DEMO_DOMAIN:-telenotify-demo.duckdns.org}
DEMO_PORT=3110

main() {
  cd "$(dirname "$0")"
  # One deploy at a time: a second push waits for GitHub's queue, not here.
  exec 9>/tmp/telenotify-deploy.lock
  flock -n 9 || { echo "Another deploy is already running" >&2; exit 1; }

  echo "Deploying $(git rev-parse --short HEAD): $(git log -1 --format=%s)"
  COMPOSE_PARALLEL_LIMIT=1 docker compose -f docker-compose.vps.yml build
  docker compose -f docker-compose.vps.yml up -d
  docker compose -f docker-compose.vps.yml ps
  # A problem with the demo never fails the deploy of the service itself.
  deploy_demo || echo "Live demo: not deployed (see the messages above). Telenotify itself is deployed." >&2
  # Old image layers pile up with every build; keep the disk from filling.
  docker image prune -f >/dev/null
}

deploy_demo() {
  if [ ! -f "$DEMO_DIR/.env" ]; then
    ask_demo_settings || return 0
  fi
  echo "Live demo: building and starting"
  # `set -e` doesn't apply inside `deploy_demo || …`, so each step returns on failure.
  (cd "$DEMO_DIR" && docker compose up -d --build) || return 1
  serve_demo || return 1
  if curl -fsS -o /dev/null --max-time 15 "https://$DEMO_DOMAIN/"; then
    echo "Live demo: up at https://$DEMO_DOMAIN"
  else
    echo "Live demo: started, but https://$DEMO_DOMAIN didn't answer yet. Give it a minute." >&2
  fi
}

# First run only, and only when someone is at the terminal: ask for the demo's
# live API key and signing secret (from the "Telenotify Demo" organization).
ask_demo_settings() {
  [ -t 0 ] || return 1
  echo
  echo "Set up the live demo at https://$DEMO_DOMAIN?"
  read -r -p "  Its live API key (tn_live_...), or press Enter to skip: " key
  [ -n "$key" ] || { echo "Live demo: skipped. You'll be asked again next deploy."; return 1; }
  read -r -s -p "  Its webhook signing secret (input hidden): " secret
  echo
  [ -n "$secret" ] || { echo "Live demo: skipped, no signing secret given."; return 1; }
  # Readable only by root.
  (umask 077 && cat > "$DEMO_DIR/.env" <<EOF
TELENOTIFY_API_KEY=$key
TELENOTIFY_SIGNING_SECRET=$secret
TELENOTIFY_API_URL=https://telenotify-api.duckdns.org
DEMO_PUBLIC_URL=https://$DEMO_DOMAIN
EOF
  ) || return 1
  echo "Live demo: settings saved in examples/live-demo/.env"
}

# Nginx in front of the demo, then a Let's Encrypt certificate. Both only once.
serve_demo() {
  command -v nginx >/dev/null || { echo "Live demo: no Nginx on this server; put a proxy in front of 127.0.0.1:$DEMO_PORT yourself." >&2; return 0; }
  local site=/etc/nginx/sites-available/telenotify-demo
  if [ ! -f "$site" ]; then
    cat > "$site" <<EOF
server {
    listen 80;
    server_name $DEMO_DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:$DEMO_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
    ln -sf "$site" /etc/nginx/sites-enabled/telenotify-demo
    { nginx -t && systemctl reload nginx; } || { rm -f "$site" /etc/nginx/sites-enabled/telenotify-demo; return 1; }
    echo "Live demo: Nginx now serves $DEMO_DOMAIN"
  fi
  if [ ! -d "/etc/letsencrypt/live/$DEMO_DOMAIN" ]; then
    certbot --nginx -d "$DEMO_DOMAIN" --redirect --non-interactive --agree-tos --register-unsafely-without-email || return 1
  fi
}

main "$@"
