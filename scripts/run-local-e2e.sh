#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PLAYWRIGHT_PORT:-4000}"
HOST="${PLAYWRIGHT_HOST:-127.0.0.1}"
BASE_URL="http://${HOST}:${PORT}"
LOG_FILE="${PLAYWRIGHT_SERVER_LOG:-/tmp/styx-playwright-server.log}"
SPEC_ARGS=("$@")

cleanup() {
  if [[ -n "${SERVER_PID:-}" ]] && kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    kill "${SERVER_PID}" >/dev/null 2>&1 || true
    wait "${SERVER_PID}" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT

cd "${ROOT_DIR}"

rm -f .next/dev/lock
pkill -f "next dev --hostname ${HOST} --port ${PORT}" >/dev/null 2>&1 || true

: > "${LOG_FILE}"
pnpm dev:pw > "${LOG_FILE}" 2>&1 &
SERVER_PID=$!

echo "Waiting for ${BASE_URL} ..."
for _ in $(seq 1 60); do
  if curl -fsS "${BASE_URL}" >/dev/null 2>&1; then
    echo "Server is healthy at ${BASE_URL}"
    break
  fi

  if ! kill -0 "${SERVER_PID}" >/dev/null 2>&1; then
    echo "dev:pw exited unexpectedly. Server log:"
    tail -n 100 "${LOG_FILE}" || true
    exit 1
  fi

  sleep 1
done

if ! curl -fsS "${BASE_URL}" >/dev/null 2>&1; then
  echo "Server did not become reachable at ${BASE_URL}"
  echo "Server log:"
  tail -n 100 "${LOG_FILE}" || true
  exit 1
fi

if [[ ${#SPEC_ARGS[@]} -eq 0 ]]; then
  pnpm exec playwright test -c playwright.local.config.ts
else
  pnpm exec playwright test -c playwright.local.config.ts "${SPEC_ARGS[@]}"
fi

