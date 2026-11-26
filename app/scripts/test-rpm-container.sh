#!/usr/bin/env bash
# Installed-package validation on a disposable Fedora userspace. No host mounts,
# host installation, privileged container, external network, or real user data.
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(node -p 'require("./package.json").version')
output="$PWD/artifacts/phase6/rpm-container"
mkdir -p "$output"
container=$(docker create --init --network none --memory 8000000000 --memory-swap 8000000000 --cpus 8 --pids-limit 1024 --security-opt seccomp=unconfined receiptai-fedora-install-test:phase6 sleep infinity)
finish() {
  docker cp "$container":/test/artifacts/phase6/. "$output/" 2>/dev/null || true
  docker inspect "$container" > "$output/container-inspect.json" || true
  docker rm -f "$container" >/dev/null
}
trap finish EXIT
docker start "$container" >/dev/null
docker exec "$container" mkdir -p /test
tar -cf - tests/e2e benchmarks/suite.cjs node_modules/playwright node_modules/playwright-core package.json | docker exec -i "$container" tar -xf - -C /test
docker exec "$container" sh -c 'mkdir -p /test/artifacts/phase6; chown -R 1000:1000 /test'
docker cp release/Receipt.AI-1.0.0-preview.1-linux-x86_64.rpm "$container":/tmp/baseline.rpm
docker cp "release/Receipt.AI-$version-linux-x86_64.rpm" "$container":/tmp/candidate.rpm
docker exec "$container" dnf install -y '--disablerepo=*' /tmp/baseline.rpm > "$output/install-baseline.log" 2>&1
docker exec -d -u 1000 "$container" Xvfb :99 -screen 0 1600x1200x24 -nolisten tcp
sleep 1
docker exec -u 1000 -w /test -e DISPLAY=:99 -e WAYLAND_DISPLAY= "$container" node tests/e2e/persistence.cjs seed /opt/Receipt.AI/receipt-ai /test/artifacts/phase6/rpm-upgrade-profile /test/artifacts/phase6/rpm-upgrade.json > "$output/persistence-seed.log" 2>&1
docker exec "$container" dnf upgrade -y '--disablerepo=*' /tmp/candidate.rpm > "$output/upgrade.log" 2>&1
docker exec "$container" rpm -V receipt-ai > "$output/rpm-verification.log" 2>&1
docker exec -u 1000 -w /test -e DISPLAY=:99 -e WAYLAND_DISPLAY= "$container" node tests/e2e/persistence.cjs verify /opt/Receipt.AI/receipt-ai /test/artifacts/phase6/rpm-upgrade-profile /test/artifacts/phase6/rpm-upgrade.json > "$output/persistence-verify.log" 2>&1
# Force the model into a fresh inode within this limited cgroup. This avoids
# assuming a host-owned warm model page cache represents cold-start memory.
docker exec "$container" sh -c 'cp --preserve=all --reflink=never /opt/Receipt.AI/resources/models/Qwen3-1.7B-Q4_K_M.gguf /tmp/fresh-model.gguf; mv /tmp/fresh-model.gguf /opt/Receipt.AI/resources/models/Qwen3-1.7B-Q4_K_M.gguf'
docker exec "$container" rpm -V receipt-ai > "$output/rpm-verification-fresh-inode.log" 2>&1
docker exec -u 1000 -w /test -e DISPLAY=:99 -e WAYLAND_DISPLAY= -e DESKTOP_NETWORK_ISOLATED=1 -e DESKTOP_ARTIFACT_PHASE=phase6 -e DESKTOP_TEST_RUN=installed-rpm -e DESKTOP_EXECUTABLE=/opt/Receipt.AI/receipt-ai "$container" node tests/e2e/desktop.cjs > "$output/acceptance.log" 2>&1
docker exec "$container" sh -c 'cat /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.swap.max /sys/fs/cgroup/memory.peak /sys/fs/cgroup/memory.events; ip address; ss -lntp' > "$output/final-environment.txt"
