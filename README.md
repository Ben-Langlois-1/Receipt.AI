# Receipt.AI

Receipt.AI is a university software engineering project for private desktop financial analysis. Import bank CSV files, review transactions and spending summaries, manage category budgets and recurring schedules, and ask AI Advisor for suggestions grounded in your imported records.

## Local AI and privacy

The React/TypeScript interface runs inside Electron. Financial totals, date interpretation, category comparisons and percentages are calculated deterministically in TypeScript. Qwen3 explains the verified facts and suggests qualitative actions; its text is screened before display. Verified figures stay visible separately, including reporting periods and missing-data limitations.

The desktop candidate bundles **Qwen3 1.7B Q4_K_M** and a CPU-only **llama.cpp** runtime. Electron manages an authenticated loopback connection and stops its owned inference process when the application closes. Financial data and inference stay on the computer; no external AI service or separate model download is required. Imported data persists in the local desktop profile. Files are not application-encrypted, and a browser development profile is separate from the desktop profile.

## Quick Start

The current classroom candidate is **1.0.0-rc.2**. Obtain the tested Linux package from the project team. Installers and model weights are not committed to Git, and this README does not advertise a public download release.

On **Fedora Linux x64**:

1. Double-click the supplied `.rpm`, choose **Install**, then open **Receipt.AI** from the applications menu. The preview is unsigned.
2. Alternatively, allow the supplied `.AppImage` to run as a program in its file properties, then double-click it. A compatible Linux desktop with GTK/X11 libraries is required; AppImage also normally needs FUSE support.
3. Wait for the local AI status to become ready. No Node.js, terminal, separate server, or internet connection is needed to use the packaged application.

Choose **Import CSV**, select a bank export, review the preview, and confirm the import. Open **AI Advisor** and try “What should I do to improve my spending habits?” Missing records are reported as unknown; transaction inflows do not establish income, and net cash flow does not establish an account balance.

See [installation and first-use instructions](docs/installation.md) for platform details, data persistence and preview limitations.

## Platform status

| Platform | Evidence for this candidate |
| --- | --- |
| Fedora Linux x64 | AppImage and RPM built; real packaged inference, offline first launch, persistence and cleanup tested. RPM installation and upgrade tested in an isolated Fedora environment. |
| Ubuntu Linux x64 | Native CI AppImage build and offline packaged acceptance passed. |
| Windows x64 | Native installer built and silent installation completed; packaged runtime/inference verification remains incomplete. |
| macOS Apple Silicon / Intel | Native DMG/ZIP packages built and DMG applications copied; packaged runtime/inference verification remains incomplete. |

Windows/macOS work is deferred. These builds do not establish verified runtime support. Packages are unsigned classroom previews, not signed/notarized public releases. Approximately 8 GB RAM is a target supported by constrained Linux testing, not a verified physical minimum specification. See the [release validation report](docs/release/validation.md) for evidence, checksums and remaining distribution requirements.

## Development

With Node.js 22+ and npm, from the repository root:

```sh
cd app
npm ci
npm test
node --experimental-strip-types --test tests/*.test.js
npx tsc -b --pretty false
npm run lint
npm run build
```

`npm run dev` starts the browser development UI; its optional local inference setup is described in the [development guide](docs/development/README.md). For desktop builds, native/model staging is required before launching or packaging; use the [desktop build guide](docs/release/desktop-build.md). Both release workflows are manual-only.

## Documentation and credits

- [Local AI and desktop architecture](docs/architecture/local-ai.md)
- [Original team UI design specification](docs/architecture/ui-design.md)
- [Development and engineering history](docs/development/README.md)
- [Release build and validation](docs/release/desktop-build.md)

Receipt.AI is a collaborative project by the Receipt.AI university project team. Financial calculations, CSV import, frontend, Budgets, Recurring Expenses, and local AI/desktop integration retain their contributors’ work and Git history. Local AI integration notes credit Yousif; repository contributions remain attributed to their authors. Electron, React, llama.cpp and Qwen3 are third-party components with their respective notices in [app/resources/licenses](app/resources/licenses). The application’s own package remains `UNLICENSED`; third-party licenses do not grant a license for the team’s application.
