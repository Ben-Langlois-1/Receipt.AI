# Model selection — historical evaluation

> This report records the pre-desktop evaluation snapshot. Its constraint, category-headline and Chase-fixture limitations were subsequently corrected; see [current release validation](../../docs/release/validation.md). Measurements were not rerun after those corrections. Raw execution evidence is generated locally and is not committed to Git.

**Recommend Qwen3 1.7B Q4_K_M as the default**, with 4B retained as a configurable
alternative. This is a selection for the current constrained Receipt.AI pipeline,
not a universal model ranking or approval of every v1.0 behavior.

## Measured comparison

Real llama.cpp + isolated Playwright UI tests: **16 questions, four synthetic
datasets, 30 generated-advice trials per model** (ten questions × three seeds),
plus six deterministic integration checks per model. All **72 trials** completed;
no trials/load failures were discarded. Production prompts, screening and financial
calculations were frozen. The application, not a substitute benchmark chatbot,
performed discovery, inference, retry, screening and rendering.

| Metric | Qwen3 1.7B | Qwen3 4B |
|---|---:|---:|
| First-pass accepted | 20/30 (66.7%) | 16/30 (53.3%) |
| Additional accepted after retry | 3/30 | 11/30 |
| Final accepted | 23/30 (76.7%) | 27/30 (90.0%) |
| Final fallback/unavailable | 7/30 (23.3%) | 3/30 (10.0%) |
| Screening withheld / generation unavailable | 5 / 2 | 3 / 0 |
| Raw generation requests, including retries | 38 | 44 |
| App response latency, median / mean | 8.89 / 11.81 s | 21.49 / 27.15 s |
| Raw generation speed, median / mean | 22.27 / 22.51 tokens/s | 11.36 / 11.07 tokens/s |
| Cached model readiness, one load | 1.08 s | 2.05 s |
| Peak server RSS (kernel high-water mark) | 2.38 GiB | 4.68 GiB |
| Peak test-group memory (kernel reported) | 3.71 GiB | 4.98 GiB |
| Mean server CPU per generated-question trial | 89.81 CPU-s | 206.20 CPU-s |
| Mean CPU occupancy during app response | 7.57 cores | 7.58 cores |
| Reviewer score, all trials / 20 | 14.70 | 16.67 |
| Reviewer score, accepted answers only / 20 | 19.17 | 18.52 |
| Reviewed fabricated monetary amounts/balances | 0 | 0 |
| Reviewed raw transport-constraint violations | 2 attempts | 3 attempts |
| Displayed transport-constraint violations | 0 (none of these answers accepted) | 3 answers |
| Conceptually misleading credit explanations | 0 | 6 attempts, all withheld |
| Deterministic checks | 6/6 | 6/6 |

Application latency includes model discovery, prompt evaluation, generation, any
retry, screening and UI rendering. Raw tokens/s excludes prompt processing and
includes all attempts, even the two useless repetitive/truncated 1.7B outputs.
Model readiness is cached startup with default warmup, **not cold-disk load time**.
Per-case seeded variability and latency ranges are in
`app/artifacts/phase4/summary.json`. Neither deterministic calculations
nor balance refusals earned model-quality points.

## Why the smaller default

Routine habits/category/housing recommendations were substantively similar: both
mostly verbalized the supplied category action plan. 4B improved final delivery,
particularly service-focused advice, but not routine recommendation quality. Its
higher overall rubric score partly reflects fewer fallbacks, which score zero;
its accepted answers were not rated better. It also passed through transport-change
advice contrary to the user's constraint. Safety/constraints take precedence over
that scalar score, followed by usefulness/reliability, then latency and memory.

1.7B has less memory pressure, about half the raw token-generation time per token,
and much shorter app response time. The observed 4B delivery gain is real, but does
not establish a safer or more useful default for this pipeline. Keep model selection
configurable; do not expect a model upgrade to repair application validation gaps.
No production model ID was hardcoded. Load the selected GGUF in llama-server;
existing discovery and `options.model` selection remain intact. The recommendation
is also recorded in [selection.json](selection.json).

## Failure review and judgment calls

- **Screening versus truth:** 1.7B's relevant subscription advice was withheld for
  omitting unrelated plan categories. A quoted `$500` was an explicit disclaimer,
  not an invented saving; the screen still rejected it. 4B repeatedly triggered
  unknown-category rejection for a bold **Note** heading. Both lost correct income
  disclaimers to conservative screening. These are not counted as hallucinations.
- **Income ambiguity:** 1.7B often skipped the actual credits/salary explanation
  and supplied budgeting actions. 4B tried explaining it, but mixed credits with
  expenses, savings or balances. Six such attempts were judged conceptually
  misleading and withheld; this is a terminology judgment, not six fabricated
  numerical balances. Neither model demonstrated a strong solution here.
- **Constraints:** both respected Housing preservation. For Transport, the app
  supplies contradictory reduction hints because it recognizes Housing protection
  only. 1.7B's substantive attempts contradicted the request or were withheld;
  two other runs degenerated into whitespace and hit the token limit. 4B's three
  contradictory answers were displayed. Zero displayed violations for 1.7B is
  **not** evidence of solving the Transport task.
- **Category comparison:** the deterministic Dining check verifies October/November
  values (220/300 USD). The displayed headline delta remains all-category
  (100 USD); it does not label the Dining-specific 80 USD delta. The 6/6 integration
  check result must not be read as complete category-query correctness.

Scores use the explicit 20-point rubric in [README.md](README.md): financial
safety, constraint compliance, specificity, question fit, coverage honesty and
clarity. Every model trial and raw attempt was reviewed. `reviews.json` records
scores/rationales; `raw-reviews.json` separates hidden errors, false-positive
screening and displayed behavior. This is one unblinded Codex reviewer, not an
independent human panel; lexical proxy scores are explicitly not ground truth.
Averages are descriptive of ten clustered questions and three seeds, not proof
of general superiority. Copying supplied hints earns no creativity/calculation
credit, although concrete delivered actions count as usable advice.

## Approximately 8 GB hardware

Host: Ryzen 7 5800X (8 cores/16 threads), roughly 64 GB RAM, Fedora. Both models
used context 4096, eight inference/batch threads, parallel one, **GPU layers zero**,
Jinja and thinking disabled, app temperature 0.2/max_tokens 400, seeds
2026/2027/2028, and prompt caching disabled. Versions, weight hashes, source hashes,
requests and CPU/backend logs are saved.

Both complete model-server + Chromium + Node workloads passed a transient **8 GiB
MemoryMax / zero-swap** limit, with no OOM events. This was safe and isolated; it
limited none of the user's existing services. The group includes browser/runtime
and charged file cache; mapped pages already charged elsewhere can affect cgroup
accounting. Vite, OS and the user's existing idle server were outside the group.
Thus **full operation on a physical approximately 8 GB computer remains an
estimate**, not verified compatibility. 1.7B has substantially more headroom;
4B may fit with a light desktop but warrants testing on actual minimum hardware.
Do not extrapolate Ryzen response times to a low-power 8 GB laptop.

Model order was fixed smaller-then-larger, page caches warm, CPU frequency/background
workload not isolated. About four seconds of routine validation overlapped 1.7B
M04-r3/M05-r3; those observations were retained and the overlap is recorded.
No GPU, energy benchmark, or Electron integration was performed.

## Reproduce and inspect

- [Runner and rubric](README.md), [suite](suite.cjs), [runner](run.cjs),
  [scorer](score.cjs), [review grouping helper](review-bundle.cjs).
- `app/artifacts/phase4/summary.json`,
  `app/artifacts/phase4/trials.jsonl`,
  `app/artifacts/phase4/suite.json`,
  `app/artifacts/phase4/manifest.json`,
  `app/artifacts/phase4/reviews.json`,
  `app/artifacts/phase4/raw-reviews.json`.
- Screenshots, raw requests/responses, server logs and 500ms memory samples reside
  in the two model subdirectories under `app/artifacts/phase4/`.

AI/benchmark regression tests, TypeScript/production build and lint pass. The full
suite retains the existing Chase expected-CSV duplicate ATM-fee mismatch. Browser
logs contain only the existing Import Preview `aria-role` warning and expected
React StrictMode model-status aborts; no unexpected browser/network failures.
No application features or teammates' production code were changed in this phase.
