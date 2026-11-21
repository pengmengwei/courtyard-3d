#!/bin/zsh
set -e
cd "$(dirname "$0")"

if [ ! -d node_modules/three ]; then
  npm install
fi

if ! curl -sf "http://127.0.0.1:5173" >/dev/null; then
  nohup npm run dev -- --port 5173 > /tmp/courtyard-3d-vite.log 2>&1 &
fi

for i in {1..30}; do
  if curl -sf "http://127.0.0.1:5173" >/dev/null; then
    open "http://127.0.0.1:5173"
    exit 0
  fi
  sleep 1
done

print "庭院预览未能启动，请查看 /tmp/courtyard-3d-vite.log"
exit 1
