#!/usr/bin/env bash
set -euo pipefail

case "${DEPLOY_ENV:-}" in
  sandbox) branch=sandbox ;;
  production) branch=main ;;
  *)
    echo "DEPLOY_ENV must be sandbox or production (got '${DEPLOY_ENV:-}')" >&2
    exit 1
    ;;
esac

cd /srv/apps/makalipie
git fetch --all
git reset --hard "origin/${branch}"
docker compose up -d --build
docker image prune -f
