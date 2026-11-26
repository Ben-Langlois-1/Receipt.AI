# Development guide

Receipt.AI uses React, TypeScript and Vite, with Electron for the packaged desktop application. Use Node.js 22+ and npm. Commands below start at the repository root.

## Setup and checks

```sh
cd app
npm ci
npm test
node --experimental-strip-types --test tests/*.test.js
npx tsc -b --pretty false
npm run lint
npm run build
```

**These commands do not download or stage GGUF weights or build/install native llama.cpp.** `npm ci` installs JavaScript dependencies and Electron tooling; `npm run build` creates frontend assets, not a standalone installer.

`npm test` runs the TypeScript unit/regression suite. The separate JavaScript command includes the team's calculation tests. Neither command replaces real packaged inference acceptance. Existing failures must be reported rather than hidden or fixed by weakening expectations.

## Browser development

`npm run dev` starts Vite at its reported local URL (normally `http://localhost:5173`). The non-AI frontend can be developed without a model server. Browser AI requests use the fixed `http://127.0.0.1:8080` endpoint; packaged Electron instead owns its authenticated, ephemeral loopback server through IPC.

Only for **browser development**, provide the model and start a separate local server. The following Linux x64 example uses this repository's supported native build script:

1. Obtain the team-approved `Qwen3-1.7B-Q4_K_M.gguf` locally. It is not in Git or installed by npm. For the approved hash and provenance limitation, see [Electron resource staging](../release/desktop-build.md#stage-resources-for-electron-development). The example model path below can be adjusted.
2. With Docker and curl available, from `app/`, run `bash scripts/build-linux-container.sh`. This retrieves checksum-pinned llama.cpp b5756 source and builds the CPU runtime under `build/native/linux-x64/`. An existing compatible b5756 build may also be used by adjusting the executable/library paths.
3. From `app/`, start the server in a separate terminal:

```sh
GGML_BACKEND_PATH="$PWD/build/native/linux-x64" \
LD_LIBRARY_PATH="$PWD/build/native/linux-x64" \
./build/native/linux-x64/llama-server \
  -m "$HOME/Models/ReceiptAI/Qwen3-1.7B-Q4_K_M.gguf" \
  --host 127.0.0.1 --port 8080 -c 4096 -ngl 0 \
  --jinja --reasoning-budget 0
```

4. In another terminal, from `app/`, run `npm run dev`, open `http://localhost:5173`, import a CSV and use AI Advisor. Use the local URL Vite reports if port 5173 is occupied. Do not replace a server already using port 8080 without checking its owner.

Pinned b5756 already handles browser CORS requests and reflects the request Origin; it has no `--cors-origins` option. Keep this unauthenticated browser-development server on loopback and use only trusted local development pages.

The hard thinking-mode switch for the pinned runtime is `--jinja --reasoning-budget 0`; `/no_think` in the prompt is supplementary. The browser adapter uses the fixed loopback endpoint. Never expose the listener on a public interface or send financial data to external AI services. No manual server is needed for installed desktop users. Browser localStorage and Electron localStorage are separate; no automatic profile migration is implemented.

## Desktop development and tests

Follow [Electron resource staging](../release/desktop-build.md#stage-resources-for-electron-development) before `npm run desktop`, `npm run package:dir` or platform packaging. Desktop tests use Playwright (already a development dependency), isolated synthetic profiles and actual local inference. Linux GUI tests also need a compatible display or Xvfb. Model weights, native outputs, installers, screenshots, logs and caches stay untracked.

Both GitHub release workflows are manual-only. Native Windows/macOS development is deferred; this documentation organization does not authorize a new release campaign.

## Engineering records

- [Current local AI architecture](../architecture/local-ai.md)
- [Original team UI design](../architecture/ui-design.md), preserved as design intent
- [AI integration history](ai-integration-history.md), historical snapshots with superseded limitations
- [Model evaluation runner and rubric](../../app/benchmarks/README.md)
- [Historical model comparison](../../app/benchmarks/COMPARISON.md)
- [Current release validation](../release/validation.md)

Keep financial arithmetic deterministic and preserve the shared ledger, Budgets and Recurring Expenses modules. Model-generated recommendations are optional suggestions, not proven financial outcomes.
