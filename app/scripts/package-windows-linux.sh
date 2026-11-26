#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export WINEPREFIX="$PWD/build/wine-packaging" WINEDEBUG=-all
export WINEDLLOVERRIDES='mscoree,mshtml=;winemenubuilder.exe=d'
export CSC_IDENTITY_AUTO_DISCOVERY=false
xvfb=${XVFB_EXECUTABLE:-"$PWD/build/test-tools/usr/bin/Xvfb"}
display_file=$(mktemp)
"$xvfb" -displayfd 3 -screen 0 1600x1200x24 -nolisten tcp 3> "$display_file" > artifacts/phase6/xvfb-wine.log 2>&1 &
display_pid=$!
trap 'wineserver -k 2>/dev/null || true; kill "$display_pid" 2>/dev/null || true; wait "$display_pid" 2>/dev/null || true; rm -f "$display_file"' EXIT
for i in {1..100}; do if [ -s "$display_file" ]; then break; fi; sleep 0.1; done
test -s "$display_file"
export DISPLAY=":$(cat "$display_file")" WAYLAND_DISPLAY=
wineserver -k 2>/dev/null || true
timeout 120s wineboot -u > artifacts/phase6/wine-initialization.log 2>&1
wine cmd /c exit
if [ "${1:-}" = --initialize-only ]; then exit 0; fi
npx electron-builder --config electron-builder.cjs --win nsis --x64
