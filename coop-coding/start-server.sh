#!/bin/bash
# Starts the co-op server locally (foreground, ctrl-C to stop).
#
# This is the same Cloudflare Worker that runs in production, served by
# `wrangler dev` - so what you test here is what your friends will hit.
# No Cloudflare login needed. Data lives in worker/.wrangler and survives restarts.
PORT=8787
cd "$(dirname "$0")/worker" || exit 1

if lsof -i :$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "พอร์ต $PORT มีคนใช้อยู่แล้ว - เซิร์ฟเวอร์น่าจะรันอยู่"
  exit 0
fi

if [ ! -d node_modules ]; then
  echo "ลง dependency ของเซิร์ฟเวอร์ครั้งแรก..."
  npm install || exit 1
fi

echo "เซิร์ฟเวอร์ทดสอบ: ws://localhost:$PORT   (กด ctrl-C เพื่อปิด)"
exec npm run dev
