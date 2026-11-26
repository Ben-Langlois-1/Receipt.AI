#!/usr/bin/env bash
# Companion source distribution for the unmodified GCC runtime libraries.
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/runtime-sources release/sources
container=$(docker create receiptai-native-builder:phase5 sleep infinity)
trap 'docker rm -f "$container" >/dev/null' EXIT
docker start "$container" >/dev/null
docker exec "$container" sh -c "sed -i 's/^# deb-src/deb-src/' /etc/apt/sources.list; apt-get update; mkdir -p /sources"
docker exec -w /sources "$container" apt-get source --download-only gcc-12=12.3.0-1ubuntu1~22.04.3
docker cp "$container":/sources/. build/runtime-sources/
cp build/llama-60ef23d6.tar.gz build/runtime-sources/
docker exec "$container" dpkg-query -W '-f=${binary:Package} ${Version} ${source:Package} ${source:Version}\n' libgcc-s1 libstdc++6 > build/runtime-sources/runtime-versions.txt
tar -cf release/sources/Receipt.AI-linux-runtime-sources.tar -C build/runtime-sources .
sha256sum release/sources/Receipt.AI-linux-runtime-sources.tar > release/sources/SHA256SUMS
