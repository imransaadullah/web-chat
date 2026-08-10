#!/usr/bin/env bash
# Run manually on the VPS after CI has shipped a build to $DEPLOY_DIR (see
# .github/workflows/deploy.yml's "Ship the built tree to the VPS" step).
# Not automated in CI: restarting the systemd service needs root, and a
# non-interactive SSH session from GitHub Actions has no way to supply a
# sudo password — so this half of the deploy is deliberately a manual step
# instead of hanging/failing in CI waiting on one.
#
# Usage (as the deploy user, not root — only the two systemctl commands
# below actually need sudo, so run this as whoever owns $DEPLOY_DIR):
#   ./scripts/deploy.sh [deploy_dir]
# deploy_dir defaults to /opt/web-chat, matching systemd/web-chat.service's
# own default.

set -euo pipefail

DEPLOY_DIR="${1:-/opt/web-chat}"
cd "$DEPLOY_DIR"

# Not --omit=dev: packages/server needs the `prisma` CLI (a devDependency)
# at deploy time for `prisma migrate deploy` below — omitting dev deps
# would silently break migrations.
npm ci

# systemd gets DATABASE_URL etc. via EnvironmentFile=$DEPLOY_DIR/.env (see
# systemd/web-chat.service) — sourcing it explicitly here too, rather than
# relying on Prisma's own .env auto-load (which looks next to
# packages/server/prisma/schema.prisma, a different directory), so there's
# exactly one .env this whole deployment reads from. `set -a`/`set +a`
# scopes the export to just this block.
set -a
source .env
set +a

cd packages/server
npx prisma migrate deploy
cd "$DEPLOY_DIR"

sudo systemctl daemon-reload
sudo systemctl restart web-chat

echo "Deployed to $DEPLOY_DIR, web-chat restarted."
