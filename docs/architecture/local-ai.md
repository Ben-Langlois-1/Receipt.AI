# Local AI and desktop architecture

Receipt.AI separates verified financial facts from model-generated recommendations. The frontend, shared financial modules, Budgets, Recurring Expenses and CSV importer retain their existing responsibilities.

## Advisor pipeline

1. CSV import produces the existing local transaction ledger.
2. TypeScript validates amounts/dates and computes currency-separated integer-cent totals, category rankings, differences and rounded percentages. Date resolution distinguishes calendar months from the latest imported month, using America/Detroit by default.
3. Coverage metadata describes found records; missing months are unknown, not verified zero spending. Records alone do not prove a complete statement. Inflows/outflows do not establish income/expenses, and a net transaction total does not establish an account balance.
4. Every question is classified by intent (breakdown, comparison, advice, lookup or overview) and receives a direct answer. TypeScript builds verified answer facts for it: integer-cent totals, exact shares computed with integer arithmetic, category ranks, size tiers, essential-category flags, the share left after the largest category, and month-to-month changes. Balance and missing-data questions use deterministic answers. Recommendation requests also produce a category review plan that preserves recognized user constraints and highlights Uncategorized records.
5. Qwen3 receives only these facts and explains them conversationally. It does not calculate figures or promise outcomes. A bounded retry with the rejection reasons may recover a rejected or truncated explanation within the shared deadline.
6. Response handling removes complete thinking blocks and rejects incomplete reasoning, empty/malformed responses and token-limit truncation. A validator checks every number, month, category, ranking, direction and share against the verified facts; rejects income, balance and guarantee claims; and blocks direct or indirect suggestions to change protected or essential categories. If the second attempt is also rejected, an intent-specific deterministic answer built from the same facts is shown instead of the rejected text. Verified figures remain available in one collapsible section and in the copied report; rejected prose is not logged as financial diagnostics.

The screen and English intent/date/constraint grammar are heuristic, not a formal guarantee of all financial truth. Incomplete metadata, arbitrary phrasing and custom categories can limit answers. The UI labels generated explanations separately from verified figures.

## Desktop boundary and lifecycle

Electron serves built assets from `receiptai://app/`. The renderer has sandboxing and context isolation enabled, Node integration disabled, and no renderer HTTP access. A narrow preload exposes validated AI status/request/cancel/retry/model selection and bounded clipboard operations. Main-process IPC accepts only the trusted main frame.

A guardian starts the bundled CPU-only llama.cpp executable on an ephemeral loopback port with a per-launch API key. Authenticated readiness verifies the selected model before requests are enabled. Shutdown or loss of the main-process IPC pipe triggers cleanup of owned inference processes. Native failures offer recovery; timeouts and cancellation cross the IPC boundary. Simultaneous guardian/main/kernel failures remain an operating-system limitation.

Qwen3 1.7B Q4_K_M is the bundled default. Model selection remains configurable, including compatible 4B GGUFs, without requiring every alternative in the installer. The pinned runtime uses Jinja and `--reasoning-budget 0`; `/no_think` is supplementary. No external AI API is used.

## Data ownership

The desktop retains the existing localStorage ledger and team budget/recurring schemas in Electron's user-data profile. An independent SQLite CLI remains in the repository; this does not imply the UI already uses SQLite. Browser/Vite and desktop profiles are separate. Files are not encrypted by the application, and future origin/schema changes require a migration plan.

See the [desktop build guide](../release/desktop-build.md) for resource layout and lifecycle details, [release validation](../release/validation.md) for measured evidence and [engineering history](../development/ai-integration-history.md) for earlier decisions. The [original UI specification](ui-design.md) remains preserved, including proposed features beyond the current implementation.
