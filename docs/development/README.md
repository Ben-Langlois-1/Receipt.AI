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

`npm test` runs the TypeScript unit/regression suite. The separate JavaScript command includes the team's calculation tests. Neither command replaces real packaged inference acceptance. Existing failures must be reported rather than hidden or fixed by weakening expectations.

## Browser development

`npm run dev` starts Vite at its reported local URL (normally `http://localhost:5173`). The non-AI frontend can be developed without a model server. Browser AI requests use the fixed `http://127.0.0.1:8080` endpoint; packaged Electron instead owns its authenticated, ephemeral loopback server through IPC.

Only for **browser development**, start the pinned llama.cpp b5756 server in another terminal with the approved GGUF, Jinja and thinking disabled:

```sh
"$HOME/llama.cpp/build/bin/llama-server" \
  -m "$HOME/Models/ReceiptAI/Qwen3-1.7B-Q4_K_M.gguf" \
  --host 127.0.0.1 --port 8080 -c 4096 -ngl 0 \
  --jinja --reasoning-budget 0 \
  --cors-origins http://localhost:5173,http://127.0.0.1:5173
```

Adjust the two local filesystem paths as needed; use the checked-in pinned runtime/build guide. Never expose the listener on a public interface or send financial data to external AI services. No manual server is needed for installed desktop users. Browser localStorage and Electron localStorage are separate; no automatic profile migration is implemented.

## Desktop development and tests

Follow [desktop build and staging](../release/desktop-build.md) before `npm run desktop`, `npm run package:dir` or platform packaging. Desktop tests use Playwright (already a development dependency), isolated synthetic profiles and actual local inference. Linux GUI tests also need a compatible display or Xvfb. Model weights, native outputs, installers, screenshots, logs and caches stay untracked.

Both GitHub release workflows are manual-only. Native Windows/macOS development is deferred; this documentation organization does not authorize a new release campaign.

## Engineering records

- [Current local AI architecture](../architecture/local-ai.md)
- [Original team UI design](../architecture/ui-design.md), preserved as design intent
- [AI integration history](ai-integration-history.md), historical snapshots with superseded limitations
- [Model evaluation runner and rubric](../../app/benchmarks/README.md)
- [Historical model comparison](../../app/benchmarks/COMPARISON.md)
- [Current release validation](../release/validation.md)

Keep financial arithmetic deterministic and preserve the shared ledger, Budgets and Recurring Expenses modules. Model-generated recommendations are optional suggestions, not proven financial outcomes.
