#!/bin/bash
# start.sh — launches פיננסיקס locally via `serve`, no build step required.
set -e

PORT=3000
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

IP="$(ipconfig getifaddr en0 2>/dev/null || true)"
if [ -z "$IP" ]; then
  IP="$(ipconfig getifaddr en1 2>/dev/null || true)"
fi

echo "מפעיל את פיננסיקס..."
echo ""
if [ -n "$IP" ]; then
  echo "כתובת ברשת המקומית (למכשירים נוספים): http://$IP:$PORT"
else
  echo "לא נמצאה כתובת רשת מקומית (Wi-Fi) — האפליקציה תהיה זמינה רק במחשב זה"
fi
echo "כתובת במחשב הזה: http://localhost:$PORT"
echo ""

npx serve "$DIR/public" -l "$PORT"
