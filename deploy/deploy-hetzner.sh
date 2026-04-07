#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ ! -f "deploy/.env.hetzner" ]]; then
  echo "Missing deploy/.env.hetzner"
  exit 1
fi

docker compose -f deploy/docker-compose.hetzner.yml --env-file deploy/.env.hetzner up -d --build
