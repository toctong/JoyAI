#!/bin/sh
# One container: nginx (:3000) + Nest (:3001) + Next (:3002).
# If any process exits, stop the rest so Docker restarts the whole stack.
set -eu

cd /app/server
PORT=3001 node dist/main.js &
server_pid=$!

cd /app/web
PORT=3002 HOSTNAME=127.0.0.1 node apps/web/server.js &
web_pid=$!

nginx -c /etc/nginx/joyai.conf -g 'daemon off;' &
nginx_pid=$!

shutdown() {
  kill "$nginx_pid" "$server_pid" "$web_pid" 2>/dev/null || true
  wait "$nginx_pid" "$server_pid" "$web_pid" 2>/dev/null || true
}

trap shutdown TERM INT

while kill -0 "$server_pid" 2>/dev/null \
  && kill -0 "$web_pid" 2>/dev/null \
  && kill -0 "$nginx_pid" 2>/dev/null; do
  sleep 2
done

shutdown
exit 1
