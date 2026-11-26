#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/native/linux-x64
if [ ! -f build/llama-60ef23d6.tar.gz ]; then
  curl --fail --location https://github.com/ggml-org/llama.cpp/archive/60ef23d6.tar.gz --output build/llama-60ef23d6.tar.gz
fi
echo 'e5098798bd11b68a4e9f5cf575a3a6db24c769db81a14a3d060a08c6c4a4edb5  build/llama-60ef23d6.tar.gz' | sha256sum --check --status
docker build -t receiptai-native-builder:phase5 -f scripts/Dockerfile.native scripts
container=$(docker create --network none receiptai-native-builder:phase5 sleep infinity)
trap 'docker rm -f "$container" >/dev/null' EXIT
docker start "$container" >/dev/null
docker exec "$container" mkdir -p /src /out
docker exec -i "$container" tar xz -C /src --strip-components=1 < build/llama-60ef23d6.tar.gz
docker exec "$container" cmake -S /src -B /out -G Ninja -DCMAKE_BUILD_TYPE=Release -DCMAKE_BUILD_RPATH_USE_ORIGIN=ON -DBUILD_SHARED_LIBS=ON -DGGML_BACKEND_DL=ON -DGGML_CPU_ALL_VARIANTS=ON -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_SERVER=ON -DLLAMA_BUILD_TOOLS=ON
docker exec "$container" cmake --build /out --target llama-server -j 8
docker cp "$container":/out/bin/. build/native/linux-x64/
# GCC runtime libraries accompany plugins; glibc stays a platform prerequisite.
docker cp -L "$container":/usr/lib/x86_64-linux-gnu/libstdc++.so.6 build/native/linux-x64/libstdc++.so.6.0.30
ln -sf libstdc++.so.6.0.30 build/native/linux-x64/libstdc++.so.6
docker cp "$container":/lib/x86_64-linux-gnu/libgcc_s.so.1 build/native/linux-x64/libgcc_s.so.1
