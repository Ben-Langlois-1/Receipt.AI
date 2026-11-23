# Desktop build and release guide

This guide covers developer build/release work for **1.0.0-rc.2**. For end-user setup use [installation](../installation.md). The [validation report](validation.md) is the authority for what was actually tested. Linux is the validated classroom candidate; Windows/macOS packaged runtime validation is deferred. Do not infer support from build configuration alone.

All commands below use the repository root or explicitly enter `app/`. Build-time downloads require internet access; packaged application startup does not.

## Architecture and ownership

Electron serves the built React application from the stable `receiptai://app/` origin. The sandboxed renderer has context isolation, no Node.js integration, no remote navigation, no popups/webviews, and no renderer HTTP access. The preload exposes only typed AI status/request/cancel/retry/model-selection operations and bounded plain-text clipboard writes. Main-process IPC accepts only the application's main frame; generation requests are size-bounded and restricted to two local API routes. No filesystem paths, bearer token, inference port, shell execution, or arbitrary HTTP client are exposed to page code.

The main process starts a dedicated guardian using Electron's embedded Node runtime. The guardian starts only the packaged native executable, reserves an OS-assigned loopback port, and passes a per-launch random API key through the child's environment. Readiness requires an authenticated `/props` response identifying the selected model. `/v1/models` alone is unsuitable for authentication in this llama.cpp version. The UI stays unavailable until readiness is confirmed. Both initialization and generation have deadlines; cancellation crosses IPC and aborts the local fetch.

Closing the final window exits the application on all platforms. Orderly shutdown asks the guardian to stop its owned native process; forceful Electron termination closes the guardian IPC pipe and triggers the same cleanup. Unexpected native termination produces a recoverable status and Retry action. The guardian has a bounded termination escalation. A simultaneous guardian/main/kernel failure cannot be guaranteed to clean up on every OS; no process-name-wide kill is used. Independent profiles use independent ephemeral ports. A rare port reservation race fails authenticated readiness rather than attaching to another server.

Native inference uses a 4096-token context, up to eight CPU threads, one inference slot, zero GPU layers, `--jinja --reasoning-budget 0`, no web UI, no request logging, and a build without CURL or GPU backends. Existing response sanitization, bounded qualitative retry, deterministic financial facts, and response screening remain in place. Model selection remains configurable through a native GGUF picker and a restore-bundled-model action. Compatible alternatives must fit the context/runtime and memory budget; selecting 4B is optional and adds no installer payload.

`src/finance/` calculations, ledger shape, category overrides, import behavior, and SQLite CLI are retained. Release hardening added generic category protection (including Housing and Transport), category-scoped comparison headlines, and narrowly documented screening false positives. It also removes two fabricated demo financial claims from the shell/Overview and noisy import debug logs. There is no budget/recurring-engine rewrite.

The constraint failure came from Housing-specific protection rather than a shared category parser/checker; protection now resolves actual imported labels and aliases and removes protected categories from the model's review plan. The comparison failure came from presenting the all-category delta even when category deltas were already available; the report now selects the requested category. Screening falsely treated harmless bold headings such as `Note`/`Instruction`, clear negative income disclaimers, and a faithful denial of a user-supplied monetary guarantee as fabricated claims. Only these narrow cases are allowed or normalized; positive claims and invented quantities still fail. A focused subscription request also exposed an overbroad grounding contract: the model was required to mention unrelated categories. Focused review plans now require the requested eligible categories, plus investigation of Uncategorized when present.

## Data and SQLite decision

Desktop data remains in the existing `receipt-ai.ledger.v1` localStorage schema under Electron's stable origin and user-data directory. Reopen/persistence is tested. Default profile locations are Linux `~/.config/Receipt.AI`, Windows `%APPDATA%/Receipt.AI`, and macOS `~/Library/Application Support/Receipt.AI` (subject to platform application-data configuration). The trusted `--user-data-dir` command-line option supports isolated test profiles. Model preferences are a separate small file in that directory.

Packaging does **not** delete, modify, or automatically read browser/Vite profiles. Existing `http://localhost:5173` data belongs to a different origin/profile and does not silently appear in Electron. Keep that profile and original imports/backups; a reviewed migration/export flow is needed if browser-edited categories must be transferred. No such transfer or destructive reset is performed here. Do not change the desktop app ID, origin, profile path, or ledger key in future releases without a migration plan.

SQLite is not required to launch this desktop implementation: the existing UI and advisor share the same ledger. The independent SQLite CLI remains intact. The repository's design document discusses SQLite but does not establish a mandatory migration contract. If the final course specification requires the UI to persist through SQLite, coordinate that separate storage integration with the finance/storage owner; This desktop implementation does not claim it is already integrated. Local files are not application-encrypted; device/user-account security and backups still matter.

## Reproducible Linux build

Development prerequisites: Node.js 22+, npm, Docker, curl, and normal Linux desktop libraries. These are **build/test** prerequisites, not additional end-user installations. From `app/`:

```sh
npm ci
bash scripts/build-linux-container.sh
MODEL_FILE="$HOME/Models/ReceiptAI/Qwen3-1.7B-Q4_K_M.gguf" \
  NATIVE_BIN_DIR=build/native/linux-x64 npm run stage:desktop
bash scripts/collect-runtime-sources.sh
python3 scripts/collect-appimage-sources.py
npm run package:linux
node scripts/verify-package.cjs release/linux-unpacked
node scripts/write-checksums.cjs
```

The native build uses an Ubuntu 22.04 userspace and pinned llama.cpp source `60ef23d6`; its archive SHA-256 is checked. It builds dispatchable x64 CPU backends rather than tuning solely for the build workstation. Matching libstdc++/libgcc runtime libraries accompany the native executable; glibc and desktop GUI libraries remain OS prerequisites. Electron/Chromium also impose their own current OS/CPU requirements. Fedora success does not prove compatibility with every Linux distribution or every old x64 processor.

Outputs: `app/release/Receipt.AI-1.0.0-rc.2-linux-x86_64.AppImage`, `.rpm`, and `linux-unpacked/`. The model and native files live outside `app.asar` under `resources/models/` and `resources/native/<platform>-<arch>/`. The GGUF has SHA-256 `d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5`. Staging refuses different weights. `manifest.json` records native hashes.

Launch the executable AppImage from the desktop file manager, or install the RPM using the system package manager. The AppImage uses the pinned static-runtime toolset `1.0.3`, rather than the legacy launcher that unconditionally disables sandboxing. On Linux, user namespaces must be available; the app refuses an injected `--no-sandbox` flag. Hosts disallowing FUSE can use the runtime's extract-and-run mode, but ordinary first-launch testing on Fedora uses the executable AppImage directly. Runtime download/update code is not included.

## Native build preparation and manual CI

The [desktop workflow](../../.github/workflows/desktop.yml) and [network diagnostic workflow](../../.github/workflows/release-network-check.yml) run only through `workflow_dispatch`. No push or pull-request event starts these jobs. They remain on `feature/local-ai-integration`; they do not publish releases or merge to main. GitHub's web dispatch controls may require the workflow to be registered on the default branch; this is not a reason to merge this review branch automatically.

The desktop workflow uses Ubuntu 22.04 x64, Windows 2022 x64, macOS 15 Apple Silicon and macOS 15 Intel. It retrieves the exact approved GGUF from the unpublished repository CI fixture (or an optional approved HTTPS override), verifies its hash, and caches it. The isolated model-preparation job has the write permission needed to read draft releases; native jobs use read-only repository permissions. No weights or private financial records are committed to Git. Model retrieval is a build step, never an end-user startup step.

For native reproduction, install Node.js 22+, CMake and the platform C++ toolchain. Fetch and checksum-verify pinned llama.cpp source `60ef23d6c14d325d83eae5752e5de39ad268e9b0` into `app/build/llama-source`; the exact archive checksum and commands are in the workflow. From `app/`:

```sh
npm ci
node scripts/build-native.cjs
# Set NATIVE_ARCH and NATIVE_BIN_DIR for the native platform/architecture.
# Set MODEL_FILE to the approved local GGUF.
npm run stage:desktop
npm run package:dir
npm run test:desktop
```

Use `build/native/<platform>-<arch>/bin` for native build output. Native Windows builds use static MSVC runtime linkage; macOS builds disable Metal/Accelerate and use loader-relative dylib paths. Build the corresponding architecture on its matching host. Installer commands remain `npx electron-builder --config electron-builder.cjs --win nsis --x64` and `--mac dmg zip --arm64` / `--mac dmg zip --x64`.

Native packages have been built, but Windows/macOS packaged acceptance remains incomplete. Windows firewall test-rule creation failed with error 87. Mac outer sandbox restrictions conflicted with Chromium sandbox initialization; a replacement owned PF network policy passed its separate control test, but the complete installed application still needs a native rerun. Do not disable Chromium sandboxing to bypass these failures.

## Automated and packaged checks

From `app/`:

```sh
npm test
node --experimental-strip-types --test tests/*.test.js
npx tsc -b --pretty false
npm run build
npm run lint
# Requires staged resources and a packaged executable:
npm run test:desktop
# After Linux packaging, with Xvfb, unshare and ip available:
bash scripts/test-desktop-linux.sh --offline
bash scripts/test-desktop-linux.sh --mounted
```

Tests use isolated synthetic profiles and real local Qwen3 inference for packaged acceptance. `DESKTOP_EXECUTABLE` selects a packaged binary; `DESKTOP_TEST_RUN` names the evidence directory. Linux offline acceptance uses a loopback-only OS network namespace. AppImage uses extract-and-run inside that namespace because FUSE mounting is prohibited there; a separate mounted test exercises normal startup. Sandboxing remains enabled. Never use a personal browser profile or real banking CSVs for these tests.

The RPM install/upgrade harness is `app/scripts/test-rpm-container.sh`. It uses disposable Fedora containers and preserves synthetic ledger fields, manual metadata, budgets and recurring state across restart/upgrade. Screenshots, traces, memory measurements and logs are generated under ignored `app/artifacts/`; these are local execution evidence, not repository download links. The validation report records the completed runs and hardware limits. No new native build/test campaign is implied by documentation maintenance.

## Redistribution and signing

Preserve `app/resources/licenses/`, model provenance and the source-collection scripts. Linux distribution must include the corresponding-source archives prepared above under `release/sources/`, plus `SHA256SUMS`; license text alone does not replace the required source materials. `RECEIPTAI_APPIMAGE_RUNTIME` allows substitution of a modified/relinked runtime. The optional MinGW cross-build is separate from native Windows CI and has not established Windows runtime support.

The approved model's exact quantizer origin is still unverified. Confirm provenance and redistribution policy before public distribution; do not bypass the approved hash. The team's application remains `UNLICENSED`, and its deliberately invalid package homepage needs a team-approved replacement before public release.

Windows public releases need publisher signing and SmartScreen evaluation. macOS needs Developer ID signing of the app and nested native components, hardened-runtime validation, notarization, stapling and clean-machine Gatekeeper tests. Credentials were not supplied. Existing NSIS/DMG/RPM packages are unsigned classroom previews, not signed public releases. See the [validation report](validation.md) for all remaining release gates.
