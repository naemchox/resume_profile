#!/bin/sh
# set-domain.sh — swap the placeholder domain for the real one, everywhere.
#
# ใช้ยังไง:  sh set-domain.sh houseandhome.co.th
#
# แก้ให้ครบทั้ง index.html (canonical, og:url, og:image, JSON-LD 6 จุด),
# robots.txt (Sitemap) และ sitemap.xml (loc) ในคำสั่งเดียว
set -e
if [ -z "$1" ]; then
  echo "usage: sh set-domain.sh <domain>   เช่น  sh set-domain.sh houseandhome.co.th" >&2
  exit 1
fi
NEW=$(printf '%s' "$1" | sed -e 's#^https\{0,1\}://##' -e 's#/$##')
DIR=$(cd "$(dirname "$0")" && pwd)
for f in index.html robots.txt sitemap.xml; do
  [ -f "$DIR/$f" ] || { echo "ข้าม $f (ไม่พบไฟล์)"; continue; }
  before=$(grep -c "houseandhome\.example" "$DIR/$f" || true)
  [ "$before" -eq 0 ] && { echo "$f: ไม่มีอะไรต้องแก้"; continue; }
  sed -i '' "s#houseandhome\.example#$NEW#g" "$DIR/$f"
  echo "$f: แก้แล้ว $before จุด -> $NEW"
done
# stamp today's date into the sitemap
if [ -f "$DIR/sitemap.xml" ]; then
  sed -i '' "s#<lastmod>[^<]*</lastmod>#<lastmod>$(date +%F)</lastmod>#g" "$DIR/sitemap.xml"
  echo "sitemap.xml: อัปเดต lastmod เป็น $(date +%F)"
fi
echo
echo "เหลืออีก $(grep -rc 'houseandhome\.example' "$DIR"/index.html "$DIR"/robots.txt "$DIR"/sitemap.xml 2>/dev/null | awk -F: '{s+=$2} END{print s+0}') จุด (ควรเป็น 0)"
