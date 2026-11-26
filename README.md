# Receipt.AI

Receipt.AI is a university software engineering project for private desktop financial analysis. Import bank CSV files, review transactions and spending summaries, manage category budgets and recurring schedules, and ask AI Advisor for suggestions grounded in your imported records.

## Local AI and privacy

The React/TypeScript interface runs inside Electron. Financial totals, date interpretation, category comparisons, rankings and percentages are calculated deterministically in TypeScript from integer cents. For every question AI Advisor builds a set of verified answer facts; Qwen3 explains those facts conversationally and suggests qualitative actions. Each answer is checked against the facts before display (figures, months, categories, rankings, directions and shares), and answers that claim income, balances or guaranteed savings, or that suggest changing categories you asked to keep unchanged or essential categories such as Housing, are rejected. A rejected answer is retried once, then replaced by a direct answer built from the same facts. Verified figures stay available separately, including reporting periods and missing-data limitations.

The desktop candidate bundles **Qwen3 1.7B Q4_K_M** and a CPU-only **llama.cpp** runtime. Electron manages an authenticated loopback connection and stops its owned inference process when the application closes. Financial data and inference stay on the computer; no external AI service or separate model download is required. Imported data persists in the local desktop profile. Files are not application-encrypted, and a browser development profile is separate from the desktop profile.

## Run the packaged desktop application

**For regular users:** the packaged application already includes the Qwen3 1.7B Q4_K_M model, native llama.cpp executable and required bundled runtime libraries. It loads the model automatically; there is no manual AI setup. Do not run the developer commands below to install the packaged application.

The current classroom candidate is **1.0.0-rc.3**. Obtain the matching package from the project team; Linux is the platform with manual, locally recorded runtime testing. Installers and model weights are not committed to Git, and this README does not advertise a public download release.

On **Fedora Linux x64**:

1. Double-click the supplied `.rpm`, choose **Install**, then open **Receipt.AI** from the applications menu. The preview is unsigned.
2. Alternatively, allow the supplied `.AppImage` to run as a program in its file properties, then double-click it. A compatible Linux desktop with GTK/X11 libraries is required; AppImage also normally needs FUSE support.
3. Wait for the local AI status to become ready. No Node.js, terminal, separate server, or internet connection is needed to use the packaged application.

Choose **Import CSV**, select a bank export, review the preview, and confirm the import. Open **AI Advisor** and try “What should I do to improve my spending habits?” Missing records are reported as unknown; transaction inflows do not establish income, and net cash flow does not establish an account balance.

See [installation and first-use instructions](docs/installation.md) for platform details, data persistence and preview limitations.

## Platform status

| Platform | Evidence for this candidate |
| --- | --- |
| Fedora Linux x64 | AppImage and RPM built and manually tested locally for the earlier rc.2 packages: real packaged inference, offline first launch, persistence, cleanup, and RPM installation/upgrade in an isolated Fedora environment. rc.3 Linux packages have not been rebuilt locally. |
| Ubuntu Linux x64 | Native CI builds the AppImage and runs offline first-launch acceptance with real inference. |
| Windows x64 | Native CI builds the NSIS installer, installs it, restricts application networking and runs packaged acceptance with real inference. |
| macOS Apple Silicon / Intel | Native CI builds the DMG/ZIP, installs the DMG, restricts application networking and runs packaged acceptance with real inference. |

All four native CI jobs passed on the commit before the AI Advisor redesign (run 45311769512). After the redesign, Ubuntu, Windows and macOS Apple Silicon passed (run 45541853553); the macOS Intel job failed on an over-strict case-sensitive test assertion about the model's wording, which rc.3 corrects. The results for the rc.3 release commit are recorded in its own CI run, not asserted here. See the [release validation report](docs/release/validation.md) for the exact evidence, checksums and limits.

CI results come from disposable GitHub-hosted runners, not manual testing on physical Windows or macOS computers. Packages are unsigned classroom previews, not signed/notarized public releases, and have not been evaluated against Windows SmartScreen or macOS Gatekeeper. Approximately 8 GB RAM is a target supported by constrained Linux testing, not a verified physical minimum specification.

## Run or build from source

**For developers:** cloning the repository and running `npm ci`, `npm test`, TypeScript checks, lint or `npm run build` does **not** install the GGUF model or the native llama.cpp executable. `npm ci` installs JavaScript development dependencies (including Electron); `npm run build` compiles TypeScript and builds frontend assets. Model weights and native inference binaries must be obtained/built and staged separately.

With Node.js 22+ and npm, run the ordinary source checks from the repository root:

```sh
cd app
npm ci
npm test
node --experimental-strip-types --test tests/*.test.js
npx tsc -b --pretty false
npm run lint
npm run build
```

Choose the setup matching what you want to run:

1. **Browser development:** `npm run dev` starts Vite. Follow [local AI setup for browser development](docs/development/README.md#browser-development) to provide a local GGUF and run llama-server at `127.0.0.1:8080` with Jinja and thinking disabled. Non-AI frontend work does not require the server.
2. **Electron development:** follow [staging model weights and native binaries](docs/release/desktop-build.md#stage-resources-for-electron-development), then use `npm run desktop`. Electron starts its own authenticated loopback server; do not manually launch a server for it.
3. **Standalone installer:** after staging, follow [building a standalone Linux installer](docs/release/desktop-build.md#build-a-standalone-linux-installer). `npm run package:linux` produces the AppImage/RPM; `npm run build` alone does not produce an installer. Windows/macOS build configuration is documented separately and still lacks completed runtime verification.

`npm run desktop`, `npm run package:dir` and installer commands do not provision missing model/native resources automatically. Both release workflows remain manual-only.

## Documentation and credits

- [Local AI and desktop architecture](docs/architecture/local-ai.md)
- [Original team UI design specification](docs/architecture/ui-design.md)
- [Development and engineering history](docs/development/README.md)
- [Release build and validation](docs/release/desktop-build.md)

Receipt.AI is a collaborative project by the Receipt.AI university project team. Financial calculations, CSV import, frontend, Budgets, Recurring Expenses, and local AI/desktop integration retain their contributors’ work and Git history. Local AI integration notes credit Yousif; repository contributions remain attributed to their authors. Electron, React, llama.cpp and Qwen3 are third-party components with their respective notices in [app/resources/licenses](app/resources/licenses). The application’s own package remains `UNLICENSED`; third-party licenses do not grant a license for the team’s application.
