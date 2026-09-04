#!/usr/bin/env bash
set -euo pipefail

cd /srv/apps/makalipie
git fetch --all
git reset --hard origin/main
docker compose up -d --build
docker image prune -f
