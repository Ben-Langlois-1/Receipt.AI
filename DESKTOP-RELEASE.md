# Receipt.AI — Phase 5 desktop preview

This file records Phase 5. Current release validation, team integration and platform evidence are in [RELEASE-VALIDATION.md](RELEASE-VALIDATION.md).

This is an unsigned architectural-review build, version `1.0.0-preview.1`. The default installer contains Qwen3 1.7B Q4_K_M and a CPU-only llama.cpp runtime. No 4B weights, system Node.js, Python, development server, model download, or separately installed llama.cpp are needed at runtime.

## Architecture and ownership

Electron serves the built React application from the stable `receiptai://app/` origin. The sandboxed renderer has context isolation, no Node.js integration, no remote navigation, no popups/webviews, and no renderer HTTP access. The preload exposes only typed AI status/request/cancel/retry/model-selection operations and bounded plain-text clipboard writes. Main-process IPC accepts only the application's main frame; generation requests are size-bounded and restricted to two local API routes. No filesystem paths, bearer token, inference port, shell execution, or arbitrary HTTP client are exposed to page code.

The main process starts a dedicated guardian using Electron's embedded Node runtime. The guardian starts only the packaged native executable, reserves an OS-assigned loopback port, and passes a per-launch random API key through the child's environment. Readiness requires an authenticated `/props` response identifying the selected model. `/v1/models` alone is unsuitable for authentication in this llama.cpp version. The UI stays unavailable until readiness is confirmed. Both initialization and generation have deadlines; cancellation crosses IPC and aborts the local fetch.

Closing the final window exits the application on all platforms. Orderly shutdown asks the guardian to stop its owned native process; forceful Electron termination closes the guardian IPC pipe and triggers the same cleanup. Unexpected native termination produces a recoverable status and Retry action. The guardian has a bounded termination escalation. A simultaneous guardian/main/kernel failure cannot be guaranteed to clean up on every OS; no process-name-wide kill is used. Independent profiles use independent ephemeral ports. A rare port reservation race fails authenticated readiness rather than attaching to another server.

Native inference uses a 4096-token context, up to eight CPU threads, one inference slot, zero GPU layers, `--jinja --reasoning-budget 0`, no web UI, no request logging, and a build without CURL or GPU backends. Existing Phase 1 sanitization, bounded qualitative retry, deterministic financial facts, and response screening remain in place. Model selection remains configurable through a native GGUF picker and a restore-bundled-model action. Compatible alternatives must fit the context/runtime and memory budget; selecting 4B is optional and adds no installer payload.

`src/finance/` calculations, ledger shape, category overrides, import behavior, and SQLite CLI are retained. The release hardening changes generic category protection (including Housing and Transport), category-scoped comparison headlines, and narrowly documented screening false positives. It also removes two fabricated demo financial claims from the shell/Overview and noisy import debug logs. There is no budget/recurring-engine rewrite.

The constraint failure came from Housing-specific protection rather than a shared category parser/checker; protection now resolves actual imported labels and aliases and removes protected categories from the model's review plan. The comparison failure came from presenting the all-category delta even when category deltas were already available; the report now selects the requested category. Screening falsely treated harmless bold headings such as `Note`/`Instruction`, clear negative income disclaimers, and a faithful denial of a user-supplied monetary guarantee as fabricated claims. Only these narrow cases are allowed or normalized; positive claims and invented quantities still fail. A focused subscription request also exposed an overbroad grounding contract: the model was required to mention unrelated categories. Focused review plans now require the requested eligible categories, plus investigation of Uncategorized when present.

## Data and SQLite decision

Desktop data remains in the existing `receipt-ai.ledger.v1` localStorage schema under Electron's stable origin and user-data directory. Reopen/persistence is tested. Default profile locations are Linux `~/.config/Receipt.AI`, Windows `%APPDATA%/Receipt.AI`, and macOS `~/Library/Application Support/Receipt.AI` (subject to platform application-data configuration). The trusted `--user-data-dir` command-line option supports isolated test profiles. Model preferences are a separate small file in that directory.

Packaging does **not** delete, modify, or automatically read browser/Vite profiles. Existing `http://localhost:5173` data belongs to a different origin/profile and does not silently appear in Electron. Keep that profile and original imports/backups; a reviewed migration/export flow is needed if browser-edited categories must be transferred. No such transfer or destructive reset is performed here. Do not change the desktop app ID, origin, profile path, or ledger key in future releases without a migration plan.

SQLite is not required to launch this desktop implementation: the existing UI and advisor share the same ledger. The independent SQLite CLI remains intact. The repository's design document discusses SQLite but does not establish a mandatory migration contract. If the final course specification requires the UI to persist through SQLite, coordinate that separate storage integration with the finance/storage owner; Phase 5 does not claim it is already integrated. Local files are not application-encrypted; device/user-account security and backups still matter.

## Reproducible Linux build

Development prerequisites: Node.js 22+, npm, Docker, curl, and normal Linux desktop libraries. These are **build/test** prerequisites, not additional end-user installations. From `app/`:

```sh
npm ci
bash scripts/build-linux-container.sh
MODEL_FILE="$HOME/Models/ReceiptAI/Qwen3-1.7B-Q4_K_M.gguf" \
  NATIVE_BIN_DIR=build/native/linux-x64 npm run stage:desktop
npm run package:linux
```

The native build uses an Ubuntu 22.04 userspace and pinned llama.cpp source `60ef23d6`; its archive SHA-256 is checked. It builds dispatchable x64 CPU backends rather than tuning solely for the build workstation. Matching libstdc++/libgcc runtime libraries accompany the native executable; glibc and desktop GUI libraries remain OS prerequisites. Electron/Chromium also impose their own current OS/CPU requirements. Fedora success does not prove compatibility with every Linux distribution or every old x64 processor.

Outputs: `app/release/Receipt.AI-1.0.0-preview.1-linux-x86_64.AppImage`, `.rpm`, and `linux-unpacked/`. The model and native files live outside `app.asar` under `resources/models/` and `resources/native/<platform>-<arch>/`. The GGUF has SHA-256 `d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5`. Staging refuses different weights. `manifest.json` records native hashes.

Launch the executable AppImage from the desktop file manager, or install the RPM using the system package manager. The AppImage uses the pinned static-runtime toolset `1.0.3`, rather than the legacy launcher that unconditionally disables sandboxing. On Linux, user namespaces must be available; the app refuses an injected `--no-sandbox` flag. Hosts disallowing FUSE can use the runtime's extract-and-run mode, but ordinary first-launch testing on Fedora uses the executable AppImage directly. Runtime download/update code is not included.

## Windows and macOS preparation

`.github/workflows/desktop.yml` defines native builds and real packaged Electron tests on Ubuntu 22.04 x64, Windows 2022 x64, macOS 15 Apple Silicon, and macOS 15 Intel. It is manual-dispatch only and requires an HTTPS URL serving the **approved exact GGUF**. Model download occurs only during the build, is hash-checked, and is never part of application startup. The local artifact's exact quantizer download origin has not been established; current upstream GGUF variants have different hashes. Publish an approved, license-compliant artifact mirror before relying on this CI. Do not bypass the checksum to make CI pass.

To reproduce natively, install Node 22+, CMake and the platform C++ toolchain (Visual Studio C++ x64 build tools on Windows; Xcode command-line tools on macOS). Run `npm ci`, fetch/extract the same checksum-verified llama.cpp archive into `app/build/llama-source`, and then from `app/`:

```sh
node scripts/build-native.cjs
# Set NATIVE_BIN_DIR to build/native/<platform>-<arch>/bin
# Set MODEL_FILE to the approved GGUF already available to the build.
npm run stage:desktop
npm run package:dir
npm run test:desktop
```

Then build installers with `npx electron-builder --config electron-builder.cjs --win nsis --x64`, or `--mac dmg zip --arm64` / `--mac dmg zip --x64`. Build the corresponding native architecture on its matching host; do not stage Linux binaries for another target. CI configures the variables and retrieves the approved artifact automatically. CPU-only macOS builds explicitly disable Metal/Accelerate. Windows builds select the static MSVC runtime; required llama/ggml DLLs accompany the executable. macOS dylibs are built for their target architecture with loader-relative runtime paths.

The workflow has **not been executed** in this workspace, which has no configured GitHub remote/credentials or compatible Windows/macOS runtime. These configurations are prepared, not evidence of Windows/macOS success. Unsigned NSIS/DMG builds are previews. Windows public distribution needs an appropriate signing certificate/reputation process. macOS needs Developer ID signing of the app and all nested native executables/dylibs, hardened-runtime validation, notarization and stapling, followed by Gatekeeper testing on clean machines. Certificate/notarization credentials are not present. RPMs are currently unsigned. Replace the deliberately invalid package homepage with the team's real project URL and confirm application licensing/branding before public release.

## Validation and evidence

Changed files are grouped by responsibility below; teammates' finance calculations and existing architecture documents were not rewritten.

| Files | Purpose |
| --- | --- |
| `app/desktop/main.cjs`, `preload.cjs`, `validation.cjs` | Packaged origin, secure Electron window/IPC, lifecycle integration, clipboard and optional native model picker |
| `app/desktop/ai-manager.cjs`, `ai-supervisor.cjs` | Authenticated managed inference, readiness, cancellation, timeouts, failure/retry and owned-process cleanup |
| `app/src/ai/desktop-bridge.ts`, `use-desktop-ai.ts`, `DesktopAiStatus.tsx`, `local-advisor.ts` | Typed renderer bridge/status and existing API adapter integration; browser development path retained |
| `app/src/ai/category-scope.ts`, `recommendation-plan.ts`, `financial-facts.ts` | Generic protected/focused category handling and category-scoped derived facts using the existing arithmetic |
| `app/src/ai/advisor-report.ts`, `advisor-presentation.ts`, `explanation-policy.ts` | Category comparison presentation, desktop clipboard, bounded harmless screening exceptions |
| `app/src/pages/AI-AdvisorPage.tsx`, `app/src/App.tsx` | Startup/retry UI wiring, import-log privacy, honest placeholder text |
| `app/src/pages/OverviewPage.tsx`, `TransactionsPage.tsx`, `ImportPreview.tsx` | Remove fabricated demo insight/noisy debug output and fix the existing invalid accessibility attribute; calculations retained |
| `app/package.json`, `package-lock.json`, `vite.config.ts`, `index.html`, `public/favicon.svg` | Pinned development-only Electron/build/test tools, desktop entry and package metadata, relative assets and application branding |
| `app/electron-builder.cjs`, `desktop/entitlements.mac.plist`, `resources/icon.*`, `resources/licenses/*` | Platform installers, bundled-resource layout, signing preparation and required notices |
| `app/scripts/build-native.cjs`, `build-linux-container.sh`, `Dockerfile.native`, `stage-resources.cjs`, `download-build-model.cjs` | Reproducible native/model staging without runtime downloads |
| `app/tests/desktop.test.ts`, `ai-release.test.ts`, `e2e/desktop.cjs`, `e2e/desktop-smoke.cjs`, `scripts/test-desktop-linux.sh` | Security/regression checks and real packaged integration/lifecycle tests |
| `.github/workflows/desktop.yml`, `app/.gitignore`, `DESKTOP-RELEASE.md` | Native-platform CI preparation, generated-resource exclusions and release review record |

Run from `app/`:

```sh
npm test
node --experimental-strip-types --test tests/ai*.test.ts tests/desktop.test.ts tests/benchmark.test.ts
npx tsc -b --pretty false
npm run build
npm run lint
npm run test:desktop
# After package:linux finishes, on a Linux host with Xvfb, unshare and ip:
bash scripts/test-desktop-linux.sh --offline
bash scripts/test-desktop-linux.sh --mounted
```

The desktop driver launches a packaged executable, real bundled Qwen3, fresh synthetic CSV profiles and a sandboxed Electron context. `DESKTOP_EXECUTABLE` selects an installer/AppImage executable; `DESKTOP_TEST_RUN` selects its evidence directory. Linux tests use an isolated Xvfb display to avoid the user's desktop and clipboard. Air-gap testing uses `unshare --user --map-current-user --net --keep-caps`, brings up only `lo`, and asserts no external network interfaces exist. FUSE mounts are prohibited inside that unprivileged namespace in this environment, so the **actual AppImage** is run there with `APPIMAGE_EXTRACT_AND_RUN=1`. A separate host test checks its normal mounted launch. This difference is an environment limitation, not an inference mock.

Evidence lives under `app/artifacts/phase5/`: screenshots, synthetic rendered/copied reports, Playwright traces, machine-readable lifecycle results, build logs, test logs and dependency audits. Older exploratory runs are retained separately; use the final `appimage-offline` and `appimage-mounted` evidence. Tests cover initializing/ready status; CSV import; real qualitative advice; protected Housing and Transport; focused subscription review; Dining's exact 80.00 USD / 36.36% category delta; unsupported balance and missing month; cancellation; authenticated private endpoints; simultaneous independent profiles; normal cleanup; reopening with 14 retained ledger rows; unexpected model termination/retry; main-process crash cleanup; and missing-model/bundled-model recovery. No mock inference is used in these checks.

Both final AppImage runs passed. Each exercised seven questions: four genuine Qwen3 explanations were accepted, and three questions used deterministic answers. Housing advice needed the existing single retry after `missing_grounding`; this was not counted as a first-pass success. The normal mounted run additionally tested an existing, corrupt GGUF and confirmed a graceful failed state. Both runs recorded zero renderer errors and zero renderer HTTP requests, with `sandbox=true`, `contextIsolation=true`, `nodeIntegration=false`, and no `--no-sandbox` switch. Final process inspection found no owned desktop, guardian, model or Xvfb processes remaining; the user's original Vite/8080 servers were still running.

| Actual question | Final rendered result (both runs) |
| --- | --- |
| Improve spending habits | Accepted category-grounded advice covering Uncategorized, Dining, Groceries and Subscriptions |
| Identify potentially unnecessary services without assuming active subscriptions | Accepted focused Subscriptions guidance and investigation of Uncategorized; unrelated categories were not mandatory |
| Save without changing housing costs | Accepted advice; Housing explicitly kept unchanged |
| Compare Dining in October and November 2026 | Deterministic +80.00 USD, +36.36%, with coverage limitations; no unrelated +100.00 total headline |
| Current bank balance | Deterministic limitation explaining verified opening balance/history requirements; no fabricated balance |
| Spending in January 2027 | Missing coverage shown as Unknown rather than zero |
| Reduce spending without changing transport costs | Accepted advice excludes Transport from cuts; Transport explicitly kept unchanged |

Representative accepted model text: “Groceries: Check the pantry, use a shopping list, and plan meals to avoid waste.” For services: “Subscriptions: Check whether the labeled services are still used before considering cancellation; the label does not prove active recurring charges.” These are model-generated responses under the supplied review-plan contract, not evidence that Qwen performed calculations.

Review [offline results](app/artifacts/phase5/appimage-offline/results.json), [mounted results](app/artifacts/phase5/appimage-mounted/results.json), [Housing screenshot](app/artifacts/phase5/appimage-offline/housing.png), [Transport screenshot](app/artifacts/phase5/appimage-mounted/transport.png), [category comparison screenshot](app/artifacts/phase5/appimage-mounted/category-comparison.png), and [artifact checksums](app/artifacts/phase5/SHA256SUMS). The Linux package command exited successfully before either final test began; the earlier overlapping packaging attempt is not counted as a successful test.

The complete unit suite reports **141 passing / 142 total**, with one pre-existing failure: `the committed Chase example is the exact canonical file` in `tests/import-statement.test.ts`, where the committed expected CSV includes an extra ATM-fee row. The importer/fixture is deliberately unchanged. CI skips that exact named test explicitly; local full-suite output retains the failure for visibility. With that exact exception excluded, **141 applicable tests pass**. AI, desktop and benchmark regression tests pass. TypeScript, production build and lint pass. No new test failures remain. Full dependency audit reports six moderate development-tooling findings introduced through electron-builder's minimatch dependency; production-only audit reports zero. The suggested automatic fix downgrades electron-builder across major versions, so it was not applied blindly.

## Supported/tested status and review boundaries

| Target | Artifact | Evidence / status |
| --- | --- | --- |
| Fedora Linux x64 | AppImage | Built and tested with real model; normal mounted launch and isolated offline extraction tests |
| Fedora Linux x64 | RPM | Built; metadata/payload inspected; system-wide installation not performed |
| Linux x64 directory | unpacked app | Real inference, isolation, persistence and crash/shutdown checks passed |
| Windows x64 | NSIS | Native CI/config prepared; build and runtime unverified |
| macOS Apple Silicon | DMG/ZIP | Native CI/config prepared; build, Gatekeeper and runtime unverified |
| macOS Intel | DMG/ZIP | Native CI/config prepared; compatible runner required; runtime unverified |

An 8 GB desktop remains a target, not a newly verified hardware claim: this packaging work ran on the existing high-memory Fedora workstation. Electron adds overhead to the Phase 4 inference measurements. Test the complete app on an actual 8 GB machine before making a minimum-spec guarantee. Additional release work includes cross-platform CI execution, clean-machine installs/upgrades/uninstalls, signing/notarization, approved model provenance/mirroring, backup/migration policy, and storage-owner agreement if SQLite is mandatory. No further AI features, benchmark campaign, or storage migration are included in Phase 5.
