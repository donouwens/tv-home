#!/usr/bin/env bash
# Signs the TV Home wrapper app and installs it on the Samsung TV.
#
#   tools/install-mac.sh 192.168.1.50          (your TV's IP address)
#
# Needs, once (see README.md, "Install on the TV"):
#   - Tizen Studio in ~/tizen-studio with TV Extensions and Samsung Certificate Extension
#   - Developer Mode on the TV, pointing at this Mac's IP
#   - a Samsung certificate profile called "TVHome" (Tizen Studio > Tools > Certificate Manager)
# Another profile name works too: TIZEN_PROFILE=MyProfile tools/install-mac.sh 192.168.1.50
set -euo pipefail

TV_IP="${1:-}"
if [ -z "$TV_IP" ]; then
  echo "Usage: tools/install-mac.sh <TV IP address>"
  echo "Find it on the TV: Settings > All Settings > Connection > Network > Network Status > IP Settings."
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TIZEN_HOME="${TIZEN_HOME:-$HOME/tizen-studio}"
TIZEN="$TIZEN_HOME/tools/ide/bin/tizen"
SDB="$TIZEN_HOME/tools/sdb"
APP_ID="TvHmDnOuws.TVHome"
PROFILE="${TIZEN_PROFILE:-TVHome}"

if [ ! -x "$TIZEN" ] || [ ! -x "$SDB" ]; then
  cat <<EOF
Tizen Studio wasn't found in $TIZEN_HOME.
Install it from https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/installing-tv-sdk.html
(to ~/tizen-studio), then in its Package Manager add "TV Extensions" and "Samsung Certificate Extension"
under Extension SDK. Installed somewhere else? Run with TIZEN_HOME=/path/to/tizen-studio.
EOF
  exit 1
fi

# 1. Connect to the TV
"$SDB" connect "$TV_IP" >/dev/null 2>&1 || true
SERIAL="$("$SDB" devices | awk -v ip="$TV_IP" 'index($1, ip) == 1 && $2 == "device" { print $1; exit }')"
if [ -z "$SERIAL" ]; then
  echo "Couldn't connect to the TV at $TV_IP. Check that:"
  echo "  - the TV is on, and on the same network as this Mac;"
  echo "  - Developer Mode is on with this Mac's IP ($(ipconfig getifaddr en0 2>/dev/null || echo 'System Settings > Wi-Fi > Details')),"
  echo "    and the TV was restarted after turning it on."
  exit 1
fi
echo "Connected to the TV ($SERIAL)."

# 2. The certificate profile has to exist (it carries this TV's ID)
if ! "$TIZEN" security-profiles list 2>/dev/null | grep -qw "$PROFILE"; then
  cat <<EOF
There's no certificate profile called "$PROFILE" yet. With the TV still connected, make it once:
  Tizen Studio > Tools > Certificate Manager > + > Samsung > TV > name it $PROFILE
  > create a new author certificate (any name and password; sign in with your Samsung account)
  > create a new distributor certificate, privilege level Public; the TV's ID (DUID) is filled in
    because it's connected > Finish.
Then run this script again.
EOF
  exit 1
fi

# 3. Package the wrapper in a scratch folder, so nothing else ends up in the .wgt
BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT
mkdir "$BUILD/src"
cp -R "$ROOT/tizen/." "$BUILD/src/"
"$TIZEN" package -t wgt -s "$PROFILE" -o "$BUILD" -- "$BUILD/src"
WGT="$(find "$BUILD" -maxdepth 1 -name '*.wgt' | head -1)"
[ -n "$WGT" ] || { echo "Packaging didn't produce a .wgt file."; exit 1; }
mv "$WGT" "$BUILD/TVHome.wgt"

# 4. Allow this certificate on the TV, install, start
"$TIZEN" install-permit -s "$SERIAL" || echo "(install-permit didn't run; carrying on)"
"$TIZEN" install -n TVHome.wgt -s "$SERIAL" -- "$BUILD"
"$TIZEN" run -p "$APP_ID" -s "$SERIAL"
echo
echo "TV Home is installed and running. To have it open whenever the TV is switched on:"
echo "Settings > All Settings > General & Privacy > Start Screen Options > Autorun Last App: On."
