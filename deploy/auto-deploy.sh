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
  ask_setup_bot
  COMPOSE_PARALLEL_LIMIT=1 docker compose -f docker-compose.vps.yml build
  docker compose -f docker-compose.vps.yml up -d
  docker compose -f docker-compose.vps.yml ps
  # A problem with the demo never fails the deploy of the service itself.
  deploy_demo || echo "Live demo: not deployed (see the messages above). Telenotify itself is deployed." >&2
  # Old image layers pile up with every build; keep the disk from filling.
  docker image prune -f >/dev/null
}

# Once, when someone is at the terminal: the setup bot that creates businesses' bots
# ("Create my bot" on the portal's Bot page). Writes SETUP_BOT_TOKEN and a fresh
# SETUP_WEBHOOK_SECRET to .env.production. Skipping writes an empty SETUP_BOT_TOKEN, so
# it isn't asked again; delete that line to be asked on the next deploy.
ask_setup_bot() {
  local file=.env.production
  [ -f "$file" ] && [ -t 0 ] || return 0
  grep -q '^SETUP_BOT_TOKEN=' "$file" && return 0
  echo
  echo "Turn on \"Create my bot\" (businesses get their bot without @BotFather)?"
  echo "  Needs a bot of ours with Bot Management Mode on in the @BotFather Mini App."
  read -r -s -p "  Paste the setup bot's token (hidden), or press Enter to skip: " token
  echo
  if [ -z "$token" ]; then
    printf '\nSETUP_BOT_TOKEN=\n' >>"$file"
    echo "Setup bot: skipped. Pasting a token on the Bot page still works."
    return 0
  fi
  printf '\nSETUP_BOT_TOKEN=%s\nSETUP_WEBHOOK_SECRET=%s\n' "$token" "$(openssl rand -hex 32)" >>"$file"
  echo "Setup bot: saved in deploy/.env.production"
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

# First run only, and only when someone is at the terminal: ask for the demo bot's
# token, then let the API set up the "Telenotify Demo" organization (owned by the
# first OPERATOR_EMAILS account) and hand back the demo's API key and signing secret.
ask_demo_settings() {
  [ -t 0 ] || return 1
  echo
  echo "Set up the live demo at https://$DEMO_DOMAIN?"
  read -r -s -p "  Paste the demo bot's token from @BotFather (hidden), or press Enter to skip: " token
  echo
  [ -n "$token" ] || { echo "Live demo: skipped. You'll be asked again next deploy."; return 1; }
  # Read the list first: `… | grep -q` stops reading early, which pipefail counts as a failure.
  local services
  services=$(docker compose -f docker-compose.vps.yml config --services) || return 1
  grep -qx api <<<"$services" || { echo "Live demo: no 'api' service in docker-compose.vps.yml." >&2; return 1; }
  local settings
  settings=$(printf '%s' "$token" | docker compose -f docker-compose.vps.yml exec -T -e DEMO_PUBLIC_URL="https://$DEMO_DOMAIN" api node dist/ops/setup-live-demo.js) || return 1
  # Readable only by root.
  (umask 077 && printf '%s\nTELENOTIFY_API_URL=https://telenotify-api.duckdns.org\nDEMO_PUBLIC_URL=https://%s\n' "$settings" "$DEMO_DOMAIN" > "$DEMO_DIR/.env") || return 1
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
