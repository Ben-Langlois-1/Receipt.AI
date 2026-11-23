#!/usr/bin/env bash
# Packaged, real-model tests on a private virtual display. Never use the user's
# browser profile or clipboard. Run only after package:linux has completed.
set -euo pipefail
cd "$(dirname "$0")/.."
mode=${1:---offline}
case "$mode" in
  --offline) exec unshare --user --map-current-user --net --keep-caps bash "$0" --inside-offline ;;
  --inside-offline)
    ip link set lo up
    export DESKTOP_NETWORK_ISOLATED=1 APPIMAGE_EXTRACT_AND_RUN=1
    export DESKTOP_TEST_RUN=${DESKTOP_TEST_RUN:-appimage-offline}
    ;;
  --mounted)
    unset DESKTOP_NETWORK_ISOLATED APPIMAGE_EXTRACT_AND_RUN
    export DESKTOP_TEST_RUN=${DESKTOP_TEST_RUN:-appimage-mounted}
    ;;
  *) echo 'Usage: bash scripts/test-desktop-linux.sh [--offline|--mounted]' >&2; exit 2 ;;
esac
version=$(node -p 'require("./package.json").version')
export DESKTOP_EXECUTABLE=${DESKTOP_EXECUTABLE:-"$PWD/release/Receipt.AI-$version-linux-x86_64.AppImage"}
test -x "$DESKTOP_EXECUTABLE"
xvfb=${XVFB_EXECUTABLE:-$(command -v Xvfb || true)}
if [ -z "$xvfb" ]; then xvfb="$PWD/build/test-tools/usr/bin/Xvfb"; fi
test -x "$xvfb"
export DESKTOP_ARTIFACT_PHASE=${DESKTOP_ARTIFACT_PHASE:-phase6}
output="artifacts/$DESKTOP_ARTIFACT_PHASE/$DESKTOP_TEST_RUN"
mkdir -p "$output"
display_file=$(mktemp)
"$xvfb" -displayfd 3 -screen 0 1600x1200x24 -nolisten tcp 3> "$display_file" > "$output/xvfb.log" 2>&1 &
display_pid=$!
trap 'kill "$display_pid" 2>/dev/null || true; wait "$display_pid" 2>/dev/null || true; rm -f "$display_file"' EXIT
for i in {1..100}; do
  if [ -s "$display_file" ]; then break; fi
  kill -0 "$display_pid"
  sleep 0.1
done
test -s "$display_file"
export DISPLAY=":$(cat "$display_file")" WAYLAND_DISPLAY=
node tests/e2e/desktop.cjs > "$output/driver.log" 2>&1
