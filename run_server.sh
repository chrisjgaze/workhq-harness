#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

node "$ROOT_DIR/server/proxy.js" &
NODE_PID=$!

python3 -m http.server 8080 --directory "$ROOT_DIR/public" &
PY_PID=$!

echo "Proxy: http://localhost:3000"
echo "Demo hub: http://localhost:8080"

trap 'echo "Stopping..."; kill "$NODE_PID" "$PY_PID"; exit' INT TERM

wait
