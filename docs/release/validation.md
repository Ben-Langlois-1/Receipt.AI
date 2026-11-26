# Receipt.AI release validation

Candidate: **1.0.0-rc.3**. This report distinguishes local proof, native CI results, and public-release prerequisites. Local manual runtime testing was performed on Linux for the earlier rc.2 packages. Native Windows and macOS packaged acceptance runs in GitHub-hosted CI. No signed public release has been published, and neither rc.2 nor rc.3 has been published as a release.

RC3 adds the redesigned AI Advisor (see below) and corrects an over-strict end-to-end test assertion that failed the macOS Intel job. The matching CI result for the RC3 release commit is recorded in that commit's own Actions run; this report does not assert a result for a run that had not finished when it was written.

## Source integration and ownership

The integration is on [`feature/local-ai-integration`](https://github.com/Ben-Langlois-1/Receipt.AI/tree/feature/local-ai-integration) in the existing team repository. It is based on team `main` commit `760a616`, which includes the completed Budget and Recurring Expenses work. Shared React files were three-way merged against the earlier common base. The latest teammate finance/calculation modules, Budget page, Recurring Expenses page, storage schemas and tests were retained. No commit was pushed to `main`, and no repository was created.

The earlier local desktop snapshot was older than team `main`; RC2 and RC3 include those teammate contributions rather than replacing them with the old placeholders. The advisor still reads its existing verified transaction facts; this work does not add AI budget-editing or recurring-detection features.

## Corrections made

| Files | Reason |
| --- | --- |
| `app/fixtures/expected/chase-checking.csv`, `app/tests/import-statement.test.ts` | Remove a duplicate ATM-fee row found only in the expected fixture. Keep exact canonical equality and independently verify twelve rows, twelve IDs, one ATM fee, 306575 outflow cents and 490000 inflow cents. The importer and arithmetic were unchanged. |
| `.gitattributes` | Keep canonical CSV/schema files and shell scripts in LF form on Windows as well as POSIX. This fixes checkout differences while retaining strict byte-for-byte test expectations. |
| `app/src/ai/local-advisor.ts`, `advisor-report.ts`, `explanation-policy.ts`, `tests/ai-release-retry.test.ts` | A real-model run exposed a truncated completion bypassing the existing retry loop. A typed truncation rejection can now use the same single retry and total deadline; incomplete text is never accepted or displayed. The prompt requests concise, nonrepetitive category bullets. Network failures are not retried. |
| `app/scripts/verify-package.cjs`, `tests/release.test.ts` | Verify the actual packaged GGUF/native hashes and architectures, resource layout, licenses, and Windows PE dependency closure. Compiler redistributables are not assumed to be system DLLs. |
| `app/scripts/build-native.cjs`, `build-windows-container.sh`, `Dockerfile.windows-cross`, `mingw-thread-compat.h` | Prepare native MSVC/macOS builds and an optional isolated MinGW cross-build. Fix missing MinGW SDK declarations, unintended exports, and CPU-plugin runtime link flags. Native Windows CI uses MSVC, not this cross-build. |
| `app/scripts/package-linux.cjs`, `collect-runtime-sources.sh`, `collect-appimage-sources.py`, `appimage-sources.json`, `resources/licenses/*` | Supply exact GCC runtime corresponding source, AppImage runtime/libfuse source and relinking recipes, and missing dependency notices. Omit the packager's obsolete optional GConf/indicator/notification library copies from AppImage payloads. |
| `app/tests/e2e/desktop.cjs`, `persistence.cjs`, `synthetic-state.cjs`, `release-metrics.cjs`, `scripts/test-rpm-container.sh` | Test real packaged inference, offline launch, cancellation, crash cleanup, complete ledger persistence and actual RPM upgrades. Preserve synthetic manual metadata, budgets and recurring state. Sample full app process-tree memory and enforce an 8 GB/no-swap container limit. |
| `app/scripts/test-installed.cjs`, `release-network-windows.ps1`, `.github/workflows/desktop.yml` | Install NSIS/DMG packages on native runners, restrict application networking during first launch, discover the actual Mac bundle, retain failed-build evidence, and hash artifacts. Firewall profile changes are limited to disposable GitHub runners and restored. |
| `app/src/App.tsx`, `App.css`, `pages/OverviewPage.tsx`, other necessary AI wiring | Preserve teammate Budget/Recurring integration, add desktop status, remove sensitive debug output and the fabricated demo AI insight. Existing calculations and currency formatting remain. |
| `app/package.json`, lockfile, release/build configuration, `docs/installation.md` | Identify the release candidate (now RC3), provide reproducible scripts, and document professor-friendly installation separately from signed public distribution. |
| `app/src/ai/advisor-answer.ts` (new), `advisor-presentation.ts`, `advisor-report.ts`, `local-advisor.ts`, `tests/ai-advisor-answer.test.ts` (new) and updated advisor tests | AI Advisor redesign (RC3). Questions such as “Where did most of my money go?” and “Compare the latest two months” previously skipped the model through a keyword gate, and advice let Qwen3 rewrite fixed tips without figures. TypeScript now builds verified answer facts for every question: integer-cent totals, exact shares, ranks, size tiers, essential flags, remainders and month-to-month changes. Qwen3 explains those facts; a validator checks every number, month, category, ranking, direction and share against them, rejects income/balance/guarantee claims, and blocks direct or indirect suggestions to change protected or essential categories. One retry with feedback is allowed; otherwise an intent-specific deterministic answer built from the same facts is shown. Breakdown wording was also corrected so a large combined remainder is not described as small. The calculation modules in `app/src/finance` and the existing `financial-facts.ts` query are unchanged from team `main`; the new facts reuse their verified results. |
| `app/scripts/release-network-windows.ps1`, firewall harness | Windows offline first-launch test harness repaired for Server 2022 address scopes and short program paths, so the packaged test restricts networking on the native runner as intended (test infrastructure only). |
| `app/tests/e2e/desktop.cjs` | The four positive category-name assertions on model prose (Housing/Dining) are now case-insensitive. The first native run after the redesign failed on macOS Intel because Qwen3 wrote “housing” in lowercase, which the advisor validator accepts. Figure checks (`2800.00\|91.33%`, `2400.00\|61.54%`), forbidden-figure checks, and every `doesNotMatch` safety assertion for protected categories, headings and reduction advice are unchanged. |

## Proven local Linux results (rc.2 packages)

These manual runs used the rc.2 packages, which predate the AI Advisor redesign. RC3 Linux packages have not been rebuilt locally; the Ubuntu CI job builds and tests an RC3 AppImage instead. The final RC2 AppImage passed both normal FUSE-mounted launch and a fresh-profile offline first launch. Offline testing used an OS network namespace containing only loopback. FUSE mounting is prohibited inside that unprivileged namespace on this host, so the actual AppImage used its extract-and-run mode there. A separate mounted test exercised ordinary AppImage startup.

The final RPM was installed in a disposable Fedora 44 environment, then upgraded from `1.0.0-preview.1` to RC2 using `dnf` with repositories disabled. Package verification passed before and after creating a fresh model inode for constrained-memory testing. The host system was not modified by this installation. Both normal desktop and isolated synthetic profiles were used only for test data; the user's existing browser and manual Vite/8080 services were preserved.

| Acceptance case | AppImage mounted | AppImage offline | Installed RPM offline |
| --- | --- | --- | --- |
| Automatic bundled-model startup and ready status | Passed | Passed | Passed |
| CSV import and real Qwen3 recommendations | Passed | Passed | Passed |
| Habit advice, focused service review, protected Housing and Transport | Accepted | Accepted | Accepted |
| Category comparison | Dining +80.00 USD / +36.36%, coverage qualified | Same | Same |
| Unsupported balance / missing month | Deterministic limitation / Unknown | Same | Same |
| Cancellation, authenticated endpoint, independent profiles | Passed | Passed | Passed |
| Normal shutdown, native crash/retry, main crash cleanup, invalid/missing model | Passed | Passed | Passed |
| Ledger restart and crash persistence | Passed | Passed | Passed |
| Cross-version ledger/manual metadata/budget/recurring preservation | Not repeated | Passed | Passed, actual RPM upgrade |

Each real-inference acceptance run asked seven questions: four model-generated explanations and three deterministic responses. Calculations are never counted as model performance. All runs retained verified figures independently of model acceptance. No renderer errors or external renderer HTTP requests were recorded. Sandboxing and context isolation were enabled, Node integration was disabled, and no `--no-sandbox` switch was used.

Evidence: `app/artifacts/phase6/appimage-offline-rc2/`, `appimage-mounted-rc2/`, and `rpm-container/`. These contain rendered/copied synthetic reports, screenshots, Playwright traces, lifecycle JSON, upgrade snapshots, package verification, and memory counters. Earlier failed/superseded attempts are retained separately rather than counted as passes.

## Automated checks

**RC3 local results (Fedora, Node 22):** the TypeScript suite reports 177 tests: 176 pass, 0 fail, 1 skipped. The skipped test is `real-model-advisor.test.ts`, which needs a running model server and is exercised by the packaged native runs instead. The team's separate JavaScript suite passes 11/11. `tsc -b` and the production build pass, and the desktop test script passes a syntax check; the packaged end-to-end suite itself runs only in native CI against installed packages.

**Earlier rc.2 result:** 153/153 tests passed locally, with no exclusions. TypeScript and the production build passed. Lint exits successfully with one pre-existing `react(purity)` warning for `new Date()` in the teammate Overview budget rendering. The same warning was reproduced against unchanged team `main`; its calculation logic was not altered to suppress it.

The former Chase failure is resolved. The first native Windows attempt additionally exposed CRLF checkout differences in the canonical header and SQL schema; LF attributes fix the source representation instead of relaxing the tests. The first Mac DMG installation attempt exposed an incorrect fixed bundle filename; installation now requires exactly one discovered application bundle and verifies its packaged identity/resources.

Production-only dependency audit: zero findings. Development-tooling audit: six moderate findings through electron-builder/minimatch. The audit's proposed automatic downgrade crosses major versions and was not applied blindly.

## Minimum hardware assessment

The Fedora host has approximately 64 GB RAM; **physical 8 GB hardware was not available**. The complete installed RPM test ran with a limit of **8,000,000,000 bytes** (about 7.45 GiB), no swap, and eight CPU cores. It included the application, model, test harness, virtual display, and file cache. A fresh model inode was created inside the limited cgroup rather than relying solely on host-owned warm model pages.

Observed one-second samples:

| Measurement | Result |
| --- | --- |
| Peak single-app resident PSS during initial advice | 2804 MiB (about 2.74 GiB) |
| Peak PSS with two independent app/model instances | 4169 MiB (about 4.07 GiB) |
| Peak whole-test cgroup memory, including cache/harness/display | 4,661,747,712 bytes (about 4.34 GiB) |
| Cgroup limit/high/OOM/OOM-kill events | Zero |

PSS avoids counting shared pages repeatedly; summed RSS is higher and is not treated as the actual app footprint. Sampling can miss short peaks. A separate desktop/OS reserve of roughly 2–3 GiB is a planning assumption, not a measurement of a clean 8 GB computer. The result supports a **qualified estimate** that the default model is plausible on an otherwise lightly loaded 8 GB desktop with a small ledger. It does not certify physical minimum hardware, large ledgers, other applications, Windows/macOS overhead, or every CPU. CPU-only inference and software-rendered acceptance were exercised. No 4B model is bundled.

## Reproduction and native CI

Native CI history for this branch:

| Run | Commit | Result |
| --- | --- | --- |
| 45311769512 | `6a889e9` (before the advisor redesign) | All four jobs passed: Windows x64 and macOS Apple Silicon/Intel installed and tested offline, Ubuntu AppImage first launch passed. |
| 45541853553 | `f3bf38c` (advisor redesign) | Ubuntu, Windows and macOS Apple Silicon passed. macOS Intel built and installed its DMG but failed one packaged assertion, a case-sensitive `/\bHousing\b/` against valid lowercase model prose; unit tests, lint and build passed there. |
| RC3 release commit | see that commit's Actions run | Not asserted by this report. |

A passing native job means the package was built, installed on a disposable runner, run with application networking restricted, and completed the packaged acceptance questions with real inference. It is not manual testing on physical hardware, a signing check, or a Gatekeeper/SmartScreen evaluation.

From `app/`, use `npm ci`, the native build/staging scripts, `npm test`, `npm run build`, and `npm run lint`. `npm run package:linux` builds the curated AppImage and RPM. The native workflow uses Windows 2022 x64, macOS 15 Apple Silicon, macOS 15 Intel, and Ubuntu 22.04. It runs only through manual dispatch; it does not publish a release or merge to `main`.

An unpublished draft release, `receiptai-ci-approved-qwen3-1.7b`, stages the exact user-approved GGUF plus its license/provenance. Its server-reported digest matches `d2387ca2dbfee2ffabce7120d3770dadca0b293052bc2f0e138fdc940d9bc7b5`, size 1,282,439,264 bytes. No financial records or user profiles were uploaded. An isolated model-preparation job has the repository-writer permission needed to read draft releases; native build/inference jobs retain read-only repository permissions. The exact model is cached across OS runners and hash-checked again during staging. An optional approved HTTPS source can replace draft retrieval at build time. Runtime users do not download weights separately.

The initial CI run started before the large fixture upload completed and stopped at asset retrieval; no native tests were credited. Subsequent runs record native build, installer and runtime steps separately. Optional local Wine attempts failed to load their 32-bit/Unix Wine components and did not produce an accepted Windows installer; partial installers were quarantined. Those attempts do not establish Windows compatibility.

## Licensing and distribution boundaries

Electron's MIT license and platform Chromium notices, llama.cpp/dependency notices, Qwen3's upstream Apache-2.0 text, React/React DOM/Scheduler MIT texts, and native runtime notices accompany the packages. Linux standalone GCC runtime libraries require corresponding-source preparation in addition to license texts; exact Ubuntu `gcc-12` source archives and patches are supplied in `sources/Receipt.AI-linux-runtime-sources.tar`. The AppImage runtime's LGPL libfuse source, upstream patch, runtime source, other dependency notices, and relinking instructions are in `sources/Receipt.AI-appimage-runtime-sources.tar`. Custom rebuilt runtime substitution is supported by the build recipe. See [GCC's redistribution FAQ](https://www.gnu.org/licenses/gcc-exception-3.1-faq.html), [Apache-2.0](https://www.apache.org/licenses/LICENSE-2.0.html), and the [pinned AppImage source](https://github.com/AppImage/type2-runtime/tree/dd6cebedcbddde9c82f89b011e8e1d40b6e43868).

The approved GGUF's exact quantizer download origin remains unverified after bounded public-revision hash checks. Its embedded Apache-2.0 metadata and approved hash are preserved, and the CI fixture stays unpublished. The team should confirm provenance and distribution policy before a public release. Receipt.AI itself remains `UNLICENSED`; third-party permissions do not select a license for the team's own application. The deliberately invalid homepage must also be replaced with the team's chosen public URL.

Windows public distribution needs publisher signing and clean-machine SmartScreen evaluation. macOS needs Developer ID signing of the complete app and nested native binaries, hardened-runtime validation, notarization, stapling and download-quarantine/Gatekeeper testing. No signing/notarization credentials were supplied. Classroom previews must remain clearly separate from a signed public release. [Electron's signing instructions](https://www.electronjs.org/docs/latest/tutorial/code-signing) describe those requirements. Native CI without quarantine is not a Gatekeeper approval test.

## Platform evidence and recommendation

| Platform | Built | Installed | Runtime/inference tested | Current status |
| --- | --- | --- | --- | --- |
| Fedora Linux x64 AppImage | Yes | Portable executable | Yes, mounted and offline | Classroom RC validated locally |
| Fedora Linux x64 RPM | Yes | Yes, isolated Fedora installation and upgrade | Yes, offline and 8 GB constrained | Classroom RC validated locally |
| Ubuntu Linux x64 | Yes | Portable AppImage | Yes, offline native CI | Passed CI packaged acceptance |
| Windows x64 | Yes, native installer | Silent installation completed on CI runner | Yes in CI, offline firewall policy (run 45541853553) | Native CI passed; unsigned, not manually tested |
| macOS Apple Silicon | Yes, native DMG/ZIP | DMG mounted and app copied on CI runner | Yes in CI, loopback-only network policy (run 45541853553) | Native CI passed; unsigned, no Gatekeeper test |
| macOS Intel | Yes, native DMG/ZIP | DMG mounted and app copied on CI runner | Passed in run 45311769512; failed one assertion in run 45541853553 (corrected in RC3) | RC3 result recorded in the release commit's run; unsigned, no Gatekeeper test |

**Handoff recommendation:** RC3 is a classroom release candidate, not a public release. Linux has manual local evidence (rc.2 packages) plus native CI; Windows and macOS have native CI evidence only. Confirm the Actions run for the RC3 release commit before distributing packages. Signed public v1.0 remains gated by signing/notarization credentials, SmartScreen and Gatekeeper evaluation, provenance/licensing review, manual testing on physical Windows and macOS machines, and minimum-hardware qualification.

The local Linux packages below are the **rc.2** packages and are retained as historical evidence; they are not the RC3 packages:

| Artifact | SHA-256 |
| --- | --- |
| `Receipt.AI-1.0.0-rc.2-linux-x86_64.AppImage` | `05fa41c8df6f968fef4f51dae692fb773094524fceda4802702cf7dd2ef978ff` |
| `Receipt.AI-1.0.0-rc.2-linux-x86_64.rpm` | `af8c376560279bf33e3f30050ea44662fce5aa0e8a387b65a632f8ba77de2640` |

The rc.2 regression run passed all 153 assertions; the RC3 results are listed under Automated checks. TypeScript/build pass; lint has the one pre-existing warning described above. Reproducible build/test code is pushed to the feature branch. Large local installers and detailed test artifacts remain in the workspace; they are not committed to Git. Earlier CI installer artifacts have short retention and are not permanent public download links.

Use [installation instructions](../installation.md) for the professor's installation steps. Existing Vite/browser data remains in its original profile; no automatic browser-to-desktop migration or SQLite migration is claimed.

Repository documentation was subsequently organized under `docs/`; validation evidence and artifact hashes above describe the tested RC2 packages, not newly rebuilt packages. See the [build guide](desktop-build.md) for reproduction and [project overview](../../README.md) for current entry points.

RC2 documentation-cleanup verification also ran the team's separate JavaScript suite: **11/11 passed**, alongside all 153 TypeScript tests, TypeScript checks and the production build. Both workflows are now manual-only. No application source, test expectations, packaging behavior or financial calculations changed during this organization pass. Lint retains the same pre-existing warning.
