#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/native/win32-x64
test -f build/llama-60ef23d6.tar.gz
echo 'e5098798bd11b68a4e9f5cf575a3a6db24c769db81a14a3d060a08c6c4a4edb5  build/llama-60ef23d6.tar.gz' | sha256sum --check --status
docker build -t receiptai-windows-cross:phase6 -f scripts/Dockerfile.windows-cross scripts
container=$(docker create --network none receiptai-windows-cross:phase6 sleep infinity)
trap 'docker rm -f "$container" >/dev/null' EXIT
docker start "$container" >/dev/null
docker exec "$container" mkdir -p /src /out
docker exec -i "$container" tar xz -C /src --strip-components=1 < build/llama-60ef23d6.tar.gz
docker cp scripts/mingw-thread-compat.h "$container":/src/receiptai-mingw-compat.h
docker exec "$container" cmake -S /src -B /out -G Ninja -DCMAKE_SYSTEM_NAME=Windows -DCMAKE_SYSTEM_PROCESSOR=AMD64 -DCMAKE_C_COMPILER=x86_64-w64-mingw32-gcc-posix -DCMAKE_CXX_COMPILER=x86_64-w64-mingw32-g++-posix -DCMAKE_RC_COMPILER=x86_64-w64-mingw32-windres -DCMAKE_BUILD_TYPE=Release '-DCMAKE_C_FLAGS=-include /src/receiptai-mingw-compat.h' '-DCMAKE_CXX_FLAGS=-include /src/receiptai-mingw-compat.h' '-DCMAKE_SHARED_LINKER_FLAGS=-static-libgcc -static-libstdc++ -Wl,--exclude-libs,ALL' '-DCMAKE_MODULE_LINKER_FLAGS=-static-libgcc -static-libstdc++ -Wl,--exclude-libs,ALL' '-DCMAKE_EXE_LINKER_FLAGS=-static-libgcc -static-libstdc++' -DBUILD_SHARED_LIBS=ON -DGGML_BACKEND_DL=ON -DGGML_CPU_ALL_VARIANTS=ON -DGGML_NATIVE=OFF -DGGML_OPENMP=OFF -DLLAMA_CURL=OFF -DLLAMA_BUILD_TESTS=OFF -DLLAMA_BUILD_EXAMPLES=OFF -DLLAMA_BUILD_SERVER=ON -DLLAMA_BUILD_TOOLS=ON
docker exec "$container" cmake --build /out --target llama-server -j 6
docker cp "$container":/out/bin/. build/native/win32-x64/
pthread=$(docker exec "$container" x86_64-w64-mingw32-g++-posix -print-file-name=libwinpthread-1.dll)
docker cp "$container":"$pthread" build/native/win32-x64/libwinpthread-1.dll
docker exec "$container" dpkg-query -W > build/native/win32-x64/build-packages.txt
docker exec "$container" sh -c 'cat /usr/share/doc/mingw-w64-common/copyright' > resources/licenses/MinGW-w64-copyright.txt
