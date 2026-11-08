#!/bin/bash
# Opens two VS Code windows (Alice and Bob) with the extension loaded from
# source, each on its own real folder. Start the server first: ./start-server.sh
#
# Each side gets its own --user-data-dir on purpose: VS Code will happily
# reuse a single extension development host window, so without separate
# profiles the second window never appears. Separate profiles also make the
# two sides behave like two different people, which is what we are testing.
#
#   ./open-test-windows.sh          both windows
#   ./open-test-windows.sh alice    just one
#   ./open-test-windows.sh reset    wipe the test profiles and start clean
HERE="$(cd "$(dirname "$0")" && pwd)"
EXT="$HERE/extension"
PROFILES="${TMPDIR:-/tmp}/coop-profiles"
PORT=8787
SERVER="ws://localhost:$PORT"

if [ "$1" = "reset" ]; then
  rm -rf "$PROFILES"
  echo "ลบโปรไฟล์ทดสอบแล้ว ($PROFILES)"
  exit 0
fi

if ! lsof -i :$PORT -sTCP:LISTEN >/dev/null 2>&1; then
  echo "เซิร์ฟเวอร์ยังไม่รัน - เปิดอีก terminal แล้วรัน ./start-server.sh ก่อน"
  exit 1
fi

# The windows load extension/out, so build it fresh every time.
echo "build extension..."
(cd "$EXT" && npm run build --silent >/dev/null) || { echo "build ไม่ผ่าน - ลอง cd extension && npm run build ดู error"; exit 1; }

# Point each profile at the local server, and give it a name, so Alice can
# create a co-op straight away without running "ตั้งเซิร์ฟเวอร์ของฉัน".
write_settings () {
  local who="$1" name="$2"
  local dir="$PROFILES/$who/User"
  mkdir -p "$dir"
  python3 - "$dir/settings.json" "$SERVER" "$name" <<'PY'
import json, sys, os
path, server, name = sys.argv[1:4]
data = {}
if os.path.exists(path):
    try:
        data = json.load(open(path))
    except Exception:
        data = {}
data["coop.serverUrl"] = server
data.setdefault("coop.userName", name)
json.dump(data, open(path, "w"), indent=2, ensure_ascii=False)
PY
}

open_window () {
  local who="$1" name="$2"
  write_settings "$who" "$name"
  code -n \
    --user-data-dir="$PROFILES/$who" \
    --extensions-dir="$PROFILES/$who-ext" \
    --extensionDevelopmentPath="$EXT" \
    --disable-workspace-trust \
    --skip-welcome --skip-release-notes \
    "$HERE/test-workspaces/$who"
}

case "${1:-both}" in
  alice) open_window alice Alice ;;
  bob)   open_window bob Bob ;;
  *)     open_window alice Alice; sleep 3; open_window bob Bob ;;
esac

cat <<MSG
เปิดแล้ว - ทั้งสองหน้าต่างชี้ไปที่ $SERVER
  Alice = เจ้าของห้อง (เครื่องหลัก)  ->  ไอคอน Co-op ซ้ายมือ -> สร้างห้องจากโฟลเดอร์นี้ -> คัดลอก invite
  Bob   = เพื่อน                      ->  ไอคอน Co-op ซ้ายมือ -> เข้าด้วย invite code -> วาง
ไฟล์จริงของ Alice อยู่ที่ $HERE/test-workspaces/alice
(ลองแก้ไฟล์ตรงนั้นด้วย TextEdit แล้วดูว่า Bob เปลี่ยนตาม)
โปรไฟล์ทดสอบอยู่ที่ $PROFILES   ล้างได้ด้วย ./open-test-windows.sh reset
MSG
