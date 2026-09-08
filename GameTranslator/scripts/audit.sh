#!/bin/sh
# Launch the installed Gloss with both debug ports and run the full-function audit against it.
# Usage: sh scripts/audit.sh      (from the repo root)
set -e
APP="$HOME/Applications/Gloss.app"
[ -d "$APP" ] || { echo "not installed at $APP — run: npm run pack:dev && cp -R dist/mac-arm64/Gloss.app ~/Applications/"; exit 2; }
pkill -f "Gloss.app/Contents/MacOS" 2>/dev/null || true
sleep 2
open -a "$APP" --args --remote-debugging-port=9222 --inspect=9229
sleep 10
PAGE=$(curl -s http://127.0.0.1:9222/json | python3 -c "import sys,json;print([t['webSocketDebuggerUrl'] for t in json.load(sys.stdin) if t['title']=='Gloss'][0])")
MAIN=$(curl -s http://127.0.0.1:9229/json | python3 -c "import sys,json;print(json.load(sys.stdin)[0]['webSocketDebuggerUrl'])")
node scripts/audit.js "$PAGE" "$MAIN"
STATUS=$?
pkill -f "Gloss.app/Contents/MacOS" 2>/dev/null || true
sleep 1
open "$APP"   # leave the app running normally, without debug ports
exit $STATUS
