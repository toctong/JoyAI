#!/bin/sh
# One container, two processes. If either exits, stop the other so Docker restarts both.
set -eu

cd /app/server
PORT=3001 node dist/main.js &
server_pid=$!

cd /app/web
PORT=3000 HOSTNAME=0.0.0.0 node apps/web/server.js &
web_pid=$!

shutdown() {
  kill "$server_pid" "$web_pid" 2>/dev/null || true
  wait "$server_pid" "$web_pid" 2>/dev/null || true
}

trap shutdown TERM INT

while kill -0 "$server_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
  sleep 2
done

shutdown
exit 1
