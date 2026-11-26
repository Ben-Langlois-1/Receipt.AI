# AI integration engineering history (Yousif)

This is a chronological record of earlier development phases, preserved for architectural decisions and regression context. Statements about starters, placeholders, missing Electron support, earlier test failures and pending verification describe those earlier snapshots and are superseded. Commands here are historical developer experiments, not packaged-application installation instructions. Current instructions are in the [development guide](README.md), [architecture](../architecture/local-ai.md) and [release validation](../release/validation.md).

The desktop now manages bundled inference, displays verified facts separately, screens prose, supports generic category constraints, and has completed Linux packaged validation. Budgets and Recurring Expenses are implemented by the team. The Chase fixture discrepancy has been corrected. Current truncation handling permits the existing single bounded retry; earlier descriptions of no truncation retry are historical.

This is an **AI integration starter**, not a finished Electron distribution. The existing import/finance logic was left intact.

## Files changed

- `app/src/ai/financial-context.ts` - exact, currency-separated category/month summaries from the ledger; strips identifying transaction records from model context.
- `app/src/ai/local-advisor.ts` - llama.cpp server adapter, prompts, model discovery, and errors.
- `app/src/pages/AI-AdvisorPage.tsx` - functional React chat page with requests and error states.
- `app/src/App.tsx` - passes the ledger into the AI page.
- `app/src/App.css` - minimal AI UI styles.
- `app/tests/ai-context.test.ts` - basic financial-context tests.
- `app/tests/ai-client.test.ts` - API adapter tests with mocked `fetch`.

## Run locally

1. Download a small instruction-tuned **GGUF** model compatible with `llama.cpp`, preferably 1B-3B and Q4 quantized for the class's 8 GB / CPU-only target.
2. Start a local llama.cpp server in another terminal:

   ```sh
   llama-server -m /absolute/path/to/your/model.gguf --host 127.0.0.1 --port 8080 -c 8192 --cors-origins http://localhost:5173,http://127.0.0.1:5173
   ```

   The supported options can vary by llama.cpp version. The server must be listening on loopback and permit the development UI's origin. **Do not enable agent tools or bind to `0.0.0.0`.**

3. Check it: `curl http://127.0.0.1:8080/v1/models`.
4. In `app/`, run `npm ci` then `npm run dev`.
5. Open the Vite URL, import one of the included bank fixture CSV files using the Import CSV button, confirm the import, then go to **AI Advisor**.
6. Enter a question. The AI will use deterministic spending summaries, not raw transaction files.

To run added tests on Node 22+: `node --experimental-strip-types --test tests/ai-*.test.ts`.

## Architecture limitations / team dependencies

- The ZIP has a React/Vite app, **not an Electron main process yet**. For packaged Electron, replace the direct renderer fetch with an Electron IPC bridge or strictly validated local service interface, and manage the llama.cpp child process lifecycle in the main process.
- The ZIP has a SQLite CLI example, but the UI ledger currently uses browser `localStorage`. AI reads that same UI ledger; coordinate any SQLite migration with Brandon.
- Budget management and recurring-expense detection are placeholders. AI **must not** pretend those results exist until the corresponding deterministic engines are connected.
- No model weights or llama.cpp binaries are bundled. A separate local model/server installation is needed.
- The model can hallucinate even when provided exact summaries; for a production app, consider displaying verified figures separately from model prose, adding purpose-built query functions, and evaluating model responses against test cases.
- This build includes all-time category totals and per-month breakdowns for the latest 12 months. Questions requiring dates beyond the latest 12 months or information not imported should be answered as unsupported.
- Keep inference local, don't expose a network listener, and don't log customer data or enable tools in llama.cpp.

## Suggested ownership and sprint deliverables

- **Sprint 1-2:** Standalone llama.cpp model proof of concept, choose GGUF model, measure latency on CPU-only hardware.
- **Sprint 3:** Financial context builder, local client, tests with fixture CSVs.
- **Sprint 4:** React wiring, connection/error handling, integration with desktop process when ready.
- **Sprint 5:** Test low RAM/no GPU case, numerical accuracy and unsupported question behavior, document model path and setup.


## Phase 1: Qwen3 response handling (installed llama.cpp b5756)

The inspected binary reports build 5756 (`60ef23d6`). In this version,
`tools/server/utils.hpp` takes `enable_thinking` from server configuration, not
from request JSON. Sending `chat_template_kwargs.enable_thinking=false` would
not disable thinking. The supported hard switch is server-side:

```sh
~/llama.cpp/build/bin/llama-server \
  -m ~/Models/ReceiptAI/Qwen3-1.7B-Q4_K_M.gguf \
  --host 127.0.0.1 --port 8080 -c 8192 \
  --jinja --reasoning-budget 0
```

Use the 4B GGUF path instead to serve that model. Retain any working local CORS
configuration. The application also appends Qwen3's `/no_think` soft control to
each request; this is not a replacement for the server-side hard switch.
See https://qwenlm.github.io/blog/qwen3/ for the model's mode controls.
No unsupported per-request thinking parameter is sent, and no server is
reconfigured automatically by the application.

Existing calls remain compatible. Optional configuration is the fourth argument:

```ts
await askLocalAdvisor(question, context, signal, {
  timeoutMs: 120_000,
  model: 'your-loaded-local-model-id-or-alias',
})
```

Omit `model` for `/v1/models` discovery. Selecting an ID does not load or swap GGUF
files in a single-model llama-server. Both supported Qwen3 sizes use the same
adapter. `getLocalModel(signal, { timeoutMs: 10_000 })` also supports a deadline.
The default total deadline is two minutes, covering discovery, generation and
body reading; cancellation remains available throughout. HTTP redirects are
rejected and all requests use the fixed loopback endpoint.

Only a completion with `finish_reason: "stop"` and valid, nonempty final text is
accepted. Complete think blocks are removed, while unmatched, nested or partial
delimiters cause an error. Separate `reasoning_content` is never displayed.
Token-limit truncation, missing finish reasons, malformed JSON/content and
unsupported tool responses fail explicitly. These checks cannot detect every
semantically unfinished sentence or untagged reasoning incorrectly marked as a
completed answer by the server; they do not validate financial claims.

Run the offline tests from `app/`:

```sh
node --experimental-strip-types --test tests/ai-*.test.ts
```

## Phase 2: deterministic financial facts

`financial-facts.ts` reuses the shared `summarize` and money utilities. It validates
calendar dates, finite safe amounts and direction/sign agreement, then builds
currency-separated monthly facts in cents. Unsafe aggregate totals fail explicitly.
All inflows remain unclassified as income; transfers and refunds do not establish
income, expenses, balances or affordability. Outflow totals include transfers;
refunds remain separate inflows because matching metadata is unavailable.

At request time, dates resolve using America/Detroit (configurable `timezone`),
with an injectable `now` for tests. The current month never depends on imported
dates. Supported periods include this/last/previous month, full English month and
year, YYYY-MM, latest imported month, latest two months, and last six calendar
months including the current month. Missing years and unsupported day/week/range
queries request clarification locally. No requested records returns a local
unknown-spending response. Explicit months outside the old 12-month window work.

The model receives only query facts, exact decimal strings, comparison differences,
rounded percentages and coverage limitations. Legacy context fields remain for
compatibility but are not sent to inference. Percentage changes have a null value
for zero baselines. Monthly/category comparisons describe found records only.
All coverage is unknown because the ledger has no statement completeness metadata;
missing months have null amounts, never verified zero spending. Six-month sums
explicitly describe found records and list missing months.

Phase 2 adds no UI, database, shared finance engine, model or network changes.
The language model can still misquote facts or ignore instructions; generated prose
is not mechanically validated. Complete-coverage claims and actual income/expense
classification require upstream metadata. Date parsing intentionally supports a
limited English grammar; conversation follow-ups and arbitrary ranges are not
implemented. Phase 2 is ready for live evaluation, not a guarantee of hallucination-free prose.

## Phase 2.1 corrections

Coordinated full month names share a single explicit year (January and February
2026). Missing years, multiple possible shared years, and implicit year crossings
require clarification; December 2025 and January 2026 is explicit and supported.
Monthly numerical responses and comparisons now render deterministically from
facts, bypassing model prose so the model cannot relabel their verified amounts.
Non-monthly explanation requests retain the local model and Phase 1 safeguards;
their prose remains subject to model error. The context defines outflow, inflow
and net flow explicitly. Balance questions return a local explanation of the
required opening balance/history or verified as-of account balance. Missing-month
responses mention comparisons only when requested.

Fixture audit: `sample-chase-november-2026.csv` has October outflows 1834.49 USD,
November outflows 1818.50 USD, and inflows 2776.12 USD in each month. The reported
941.63 and 957.62 USD are net flows, not outflows. These are fixture findings;
the live browser-localStorage ledger is not available in this workspace and may
contain other imports. The importer does not retain the CSV's Balance column as
a verified account balance. No fixture or shared financial calculation was changed.

## Phase 3: presentation and explanation screening

The advisor page now calls `askAdvisorReport`, which snapshots deterministic query
facts before inference. `advisor-presentation.ts` displays periods, date bounds,
currencies, transaction counts, unknown coverage, inflows, outflows, net flow,
category outflows and supported imported-record comparisons independently of
model output. Missing records render Unknown, never a fabricated zero. Balance
and ambiguous-date responses stay local. Verified refers to arithmetic over the
imported records, not completeness or verified income/expenses.

A separate local-model request supplies qualitative explanations and conditional
budgeting options, using the same facts, model configuration, fixed loopback
transport, deadline, cancellation, non-thinking controls and Phase 1 response
parsing. Monthly requests can now receive explanations as well as figures. The
original `askLocalAdvisor` text API remains backward compatible.

The model is instructed to avoid repeating quantities/dates or deriving budget
targets. A conservative screen withholds prose containing numeric/currency/date
claims and common unsupported balance, income, affordability, recurring-payment,
comparison and action claims. Withheld prose is replaced by labeled application
guidance; inference errors retain the figures and show explanation unavailability.
The UI never labels model prose as verified. Screening is heuristic, may reject
valid prose, and cannot establish the truth of arbitrary natural language. Live
verification with both Qwen3 sizes remains necessary; no inference benchmark or
Electron work was performed.

Markdown supports paragraphs, headings, bullet/numbered lists, bold, italic and
inline code through React text nodes. Raw HTML is escaped. Links/images, nested
lists, tables and fenced code blocks are intentionally not implemented. No new
dependencies were added. Presentation tests use React server rendering, not browser
layout automation.

## Phase 3.1: useful qualitative explanations

The previous screen rejected isolated words irrespective of meaning: `may` was
matched as a month, `one` as a financial quantity, `lower` as an unsupported trend,
and any balance/income mention as a claim, even in uncertainty statements. The
prompt also inherited “cite the exact month” while presentation mode forbade dates.
Prior live response texts were not retained, so individual triggers for those four
responses cannot be reconstructed.

`explanation-policy.ts` now owns the qualitative prompt and structured rejection
codes: empty, numeric_claim, date_claim, unsafe_format,
unsupported_financial_claim, unsupported_pattern, unknown_category. Reports store
only codes per attempt, never rejected prose; an expandable Explanation checks
section shows those codes without logging financial content. Valid advice using
“may”, procedural counts, conditional reduction suggestions, and specified unknown
income/balance statements is accepted. Money/date claims and unsupported positive
financial assertions remain screened. Exact application-derived leading-category
sentences can pass the ranking check, including ties, per currency and selected
record scope. This is a heuristic screen, not a semantic proof; arbitrary wording
and unmarked invented category references may escape detection. Some legitimate
phrases or unusual category labels can still be rejected.

Explanations receive category labels, app-derived qualitative patterns and coverage
limitations, rather than numeric totals. Arithmetic remains in the existing facts
layer and figures panel. The qualitative prompt stands alone to avoid conflicting
date/amount instructions. Pure numerical queries never request a model explanation;
recommendation/explanation requests do. Balances, unresolved dates and absent
records remain local. The legacy askLocalAdvisor string API remains unchanged.

After a screening failure, one retry uses a stricter conditional-advice prompt.
Both attempts share one configured total deadline, including discovery and body
reading; caller cancellation interrupts either. Parse errors/truncation/network
errors fail explicitly rather than retrying them. Verified figures survive all
explanation failures. A second screening failure returns labeled application
guidance with the imported category labels; accepted original/retried prose is
shown unchanged. No rejected raw text is persisted by the report or logged.

Regression tests cover the two live acceptance questions using mocked model
responses, false-positive vocabulary, verified rankings, hallucination rejection,
reason codes, recovery, bounded fallback, total timeout, cancellation, numerical
routing, balance/missing-data handling and retained figures. Actual live acceptance
with Qwen3 still needs rechecking; these tests do not measure model acceptance rates.

## Phase 3.2: real-model/browser verification

Verified on the existing local services: llama.cpp b5756, Qwen3 1.7B Q4_K_M,
`--jinja --reasoning-budget 0`, loopback port 8080, Vite localhost:5173.
Playwright ran a fresh headless Chromium context with a synthetic canonical CSV
imported through the UI. No existing browser profile or financial ledger was used.
Playwright was installed in `/tmp/receiptai-browser`; no application dependencies
or package lockfiles were changed. Sandbox socket restrictions required running
the browser test outside that restriction.

The baseline actually reproduced: habits advice withheld (conditional
"affordable" wording plus a non-exact ranking, followed by false unknown-category
rejection of **Check Subscriptions**); repetitive category advice with no
Uncategorized investigation; no generation for the save-more/housing question
because intent classification missed that wording. Category amounts and rejection
codes were present in DOM/rendered output, but hidden by collapsed details in
visible text. A dedicated Copy report serializer now includes those fields
independently of details expansion. No empty list items were found in the DOM.
External copied-report serialization outside the app cannot be diagnosed fully.

`recommendation-plan.ts` selects review categories from existing per-currency
integer-cent rankings, investigating Uncategorized first, then up to three
non-Housing/non-transfer/non-Income categories. Housing is not a default reduction
target; explicit requests to keep housing/rent/mortgage unchanged are carried into
the prompt and checked in the response. Category-specific action ideas guide the
model instead of an unprioritized label list or a rigid verbatim ranking claim.
Response quality checks require the selected categories, in addition to the
existing numeric/date/financial-claim screen. One retry and the shared deadline
remain unchanged. The original financial arithmetic and Phase 1 handling remain
unchanged. English intent/constraint recognition and prose screening remain
heuristic; additional constraints beyond housing need further support. Suggestions
are optional actions, not verified financial outcomes. Other custom category
labels may still trigger conservative screening.

Actual final UI results (all passed, first-attempt generation for advice):
- Improve spending habits: investigate Uncategorized; Dining planning; Groceries
  pantry/list/meal planning; Subscriptions usage checks, with unverified coverage.
- Categories to reduce: same evidence-ranked review order, distinct practical
  category suggestions, no invented amounts/rankings.
- Save more without housing changes: accepted advice focused on other categories;
  Housing shown as kept unchanged, no suggestion to cut rent or move.
- Compare October/November 2026: synthetic outflows 1900.00/2000.00 USD, difference
  100.00 USD, 5.26%; imported-record-only/unknown-coverage limitations; no generation.
- Current bank balance: deterministic opening-balance/history requirement; no
  fabricated balance and no generation.

Screenshots, copied text, synthetic CSV, raw synthetic model responses, console and
network records, and Playwright traces are in `app/artifacts/phase3.2/acceptance/`.
Baseline and first-iteration artifacts are preserved separately. The only console
warning is pre-existing ImportPreview `aria-role`; the only failed network entry
is React StrictMode's expected abort of its first `/v1/models` effect request.
The runner records these, excludes only these known conditions from failure
assertions, and rejects any other console errors or network failures.

Reproduce with local services already running:

```sh
npm install --prefix /tmp/receiptai-browser playwright --no-audit --no-fund
PLAYWRIGHT_MODULE=/tmp/receiptai-browser/node_modules/playwright \
PLAYWRIGHT_EXECUTABLE=/home/ymehsen/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell \
PHASE32_RUN=acceptance node app/tests/e2e/phase32.cjs
```

If using matching Playwright-managed Chromium, omit PLAYWRIGHT_EXECUTABLE and
install the matching browser with Playwright's install command. Run from the
project root. This is an end-to-end acceptance test, not a model benchmark.
AI tests, TypeScript/production build, and lint pass. The full suite still has the
pre-existing duplicated ATM-fee row mismatch in the expected Chase fixture.
