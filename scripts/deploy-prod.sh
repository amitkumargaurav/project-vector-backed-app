#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

DEPLOY_HOST="${DEPLOY_HOST:-168.144.69.57}"
DEPLOY_USER="${DEPLOY_USER:-root}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"
DEPLOY_TARGET_DIR="${DEPLOY_TARGET_DIR:-/opt/project-vector-backend}"
DEPLOY_ENV_FILE="${DEPLOY_ENV_FILE:-.env.production}"
DEPLOY_SYNC_ENV="${DEPLOY_SYNC_ENV:-true}"
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-/home/amit/Documents/project vector/do_sshkey}"
DEPLOY_HEALTH_PATH="${DEPLOY_HEALTH_PATH:-/api/health}"
DEPLOY_SMOKE_PATH="${DEPLOY_SMOKE_PATH:-/api/health}"

SSH_ARGS=(-p "$DEPLOY_PORT")
if [[ -n "$DEPLOY_SSH_KEY" ]]; then
  if [[ ! -f "$DEPLOY_SSH_KEY" ]]; then
    echo "SSH key not found: $DEPLOY_SSH_KEY" >&2
    echo "Set DEPLOY_SSH_KEY=/path/to/key to override." >&2
    exit 1
  fi
  SSH_ARGS=(-i "$DEPLOY_SSH_KEY" -o IdentitiesOnly=yes "${SSH_ARGS[@]}")
fi

if [[ ! -f "$PROJECT_ROOT/docker-compose.prod.yml" ]]; then
  echo "Missing docker-compose.prod.yml" >&2
  exit 1
fi

if [[ "$DEPLOY_SYNC_ENV" == "true" && ! -f "$PROJECT_ROOT/$DEPLOY_ENV_FILE" ]]; then
  echo "Missing $DEPLOY_ENV_FILE. Copy .env.production.example and fill production values first." >&2
  exit 1
fi

echo "Deploying Project Vector Backend"
echo "  host: $DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_PORT"
echo "  target: $DEPLOY_TARGET_DIR"
echo "  env file: $DEPLOY_ENV_FILE"
echo "  health path: $DEPLOY_HEALTH_PATH"
echo "  smoke path: $DEPLOY_SMOKE_PATH"

RSYNC_EXCLUDES=(
  --exclude .git/
  --exclude .idea/
  --exclude .agents/
  --exclude .codex/
  --exclude node_modules/
  --exclude dist/
  --exclude coverage/
  --exclude .env
  --exclude .env.development
)

if [[ "$DEPLOY_SYNC_ENV" != "true" ]]; then
  RSYNC_EXCLUDES+=(--exclude "$DEPLOY_ENV_FILE")
fi

ssh "${SSH_ARGS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "mkdir -p '$DEPLOY_TARGET_DIR'"

RSYNC_SSH_COMMAND="ssh -p $DEPLOY_PORT"
if [[ -n "$DEPLOY_SSH_KEY" ]]; then
  RSYNC_SSH_COMMAND="ssh -i \"$DEPLOY_SSH_KEY\" -o IdentitiesOnly=yes -p $DEPLOY_PORT"
fi
rsync -az --delete "${RSYNC_EXCLUDES[@]}" -e "$RSYNC_SSH_COMMAND" "$PROJECT_ROOT/" "$DEPLOY_USER@$DEPLOY_HOST:$DEPLOY_TARGET_DIR/"

ssh "${SSH_ARGS[@]}" "$DEPLOY_USER@$DEPLOY_HOST" "
  set -euo pipefail
  cd '$DEPLOY_TARGET_DIR'
  test -f '$DEPLOY_ENV_FILE'
  command -v docker >/dev/null
  docker compose version >/dev/null
  APP_ENV_FILE='$DEPLOY_ENV_FILE' docker compose --env-file '$DEPLOY_ENV_FILE' -f docker-compose.prod.yml up -d --build --remove-orphans
  APP_ENV_FILE='$DEPLOY_ENV_FILE' docker compose --env-file '$DEPLOY_ENV_FILE' -f docker-compose.prod.yml ps
  HEALTH_URL='http://127.0.0.1:'\"\${APP_PORT:-3000}\"'$DEPLOY_HEALTH_PATH'
  SMOKE_URL='http://127.0.0.1:'\"\${APP_PORT:-3000}\"'$DEPLOY_SMOKE_PATH'
  for attempt in \$(seq 1 24); do
    if curl -fsS \"\$HEALTH_URL\" >/dev/null; then
      echo 'Health check passed.'
      echo \"Smoke test: \$SMOKE_URL\"
      curl -fsS \"\$SMOKE_URL\"
      echo
      exit 0
    fi
    sleep 5
  done
  echo 'Deployment started, but health check did not pass within 120 seconds.' >&2
  docker compose --env-file '$DEPLOY_ENV_FILE' -f docker-compose.prod.yml logs app --tail=200 >&2
  exit 1
"

echo
echo "Deployment complete."
echo "Health: http://$DEPLOY_HOST:3000$DEPLOY_HEALTH_PATH"
echo "Smoke: http://$DEPLOY_HOST:3000$DEPLOY_SMOKE_PATH"
