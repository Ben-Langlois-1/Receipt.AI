# Receipt.AI

## Basic Application UI Foundation

This document defines an initial, production-oriented UI concept for Receipt.AI (desktop app for Windows, macOS, Linux) with a focus on clarity, privacy, explainability, and user control.

---

## 1) Proposed Information Architecture

### Global Navigation
- **Overview**
- **Transactions**
- **Budgets**
- **Recurring Expenses**
- **AI Advisor**
- **Settings & Privacy**

### Supporting Structures
- **Global search** (transactions, merchants, categories)
- **Context panel** (details/explanations for selected item)
- **Status rail** (privacy + local model health)

### Data Ownership Model (UI-facing)
- **Imported data** (raw records from CSV/imports)
- **AI suggestions** (not applied automatically)
- **User-approved changes** (final source of truth)

---

## 2) Desktop Main Window Layout

### Shell
- **Left sidebar (fixed)**  
  App name, primary navigation, unread attention badges (e.g., uncategorized count), settings entry.
- **Top bar (contextual)**  
  Page title, date range control, quick actions (Import CSV, Add Budget), global search.
- **Main content area (responsive cards/table regions)**  
  Primary view content.
- **Right details panel (collapsible)**  
  Explanations (“why categorized this way”), AI rationale, selected item details.
- **Footer/status strip (subtle)**  
  “Local only” privacy indicator, model availability, last sync/import timestamp.

### Responsive Behavior (desktop-first)
- Large desktop: 3-pane layout (sidebar + content + details).
- Small laptop: details panel collapses to drawer; cards stack vertically.

---

## 3) Visual Design System

### Colors
- **Light background:** `#F6F8FA`
- **Dark background:** `#0F1720`
- **Surface cards:** `#FFFFFF` / `#18222D`
- **Primary accent (calm blue):** `#3A7DCE`
- **Secondary accent (teal):** `#2F9E97`
- **Positive (under budget):** `#2E8B57`
- **Warning (near/exceeded):** `#D18A00`
- **Critical (sparingly):** `#C44536`
- **Text primary:** `#1B1F24` / `#E6EDF3`
- **Text secondary:** `#59636E` / `#9BA7B3`

Category colors should be fixed and reused across charts/tables/chips for trust and recognition.

### Typography
- Font stack: `Inter, Segoe UI, Roboto, system-ui, sans-serif`
- Scale:
  - Display: 28/34
  - H1: 24/30
  - H2: 20/26
  - H3: 16/22
  - Body: 14/20
  - Caption: 12/16

### Spacing
- 4px base scale: `4, 8, 12, 16, 20, 24, 32`
- Default card padding: `16`
- Section gaps: `24`

### Border Radius
- Inputs/buttons: `8`
- Cards/modals: `12`
- Pill/chips: `999px`

### Shadows
- Card resting: `0 1px 2px rgba(16,24,40,0.08)`
- Card hover/focus: `0 6px 16px rgba(16,24,40,0.12)`

### Icons
- Simple outline icons (finance + system status).
- Always pair icon + text label for key actions.

### Charts
- Prefer readable bar/line/donut with direct legends.
- Always show labels, units, and time range.
- Empty/no-data states included in chart container.

### Buttons
- Variants: Primary, Secondary, Tertiary, Destructive.
- Primary reserved for one main action per section.
- Clear focus ring for keyboard users.

### Forms
- Plain-language labels, helper text, validation under field.
- Confirm dialogs for irreversible actions.
- AI-generated values marked as “Suggested”.

### Tables
- Sticky headers, sortable columns, row selection.
- Inline editable category cells.
- Status chips: Imported / Suggested / User Confirmed / Uncategorized.

### Alerts
- Info, Warning, Critical styles with concise action.
- Red used only for true risk/over-limit states.

### Empty States
- Explain what is missing + give next best action button.
- Avoid blame language.

---

## 4) Wireframe-Level Screen Descriptions

### Overview Dashboard
- Top KPI cards: Current month spend, Income, Expenses, Remaining budget.
- Mid row:
  - Spending by category (donut/bar).
  - Monthly trend (line chart).
- Bottom row:
  - Recent transactions table (latest 10).
  - Upcoming recurring expenses list.
- AI summary card:
  - 2–4 bullet insights
  - “Why am I seeing this?” expandable rationale
  - Recommended actions (e.g., “Review Dining: +38% vs last month”).

### Transactions
- Header actions: Import CSV (drag/drop target), bulk edit button.
- Controls: Search, filters (date/category/status), sort presets.
- Main table columns: Date, Merchant, Amount, Category, Status.
- Uncategorized rows highlighted with neutral warning tone.
- Inline category dropdown per row.
- Right details panel:
  - Full transaction metadata
  - “Why this category?” explanation
  - Manual override + undo.

### Budgets
- Budget list/cards by month + category.
- Progress bars with planned vs actual.
- Warning badges near/exceeded.
- AI suggestions module:
  - Suggested amount + basis (historical spend window)
  - Explicit “Approve” / “Edit” / “Dismiss” controls.

### Recurring Expenses
- Auto-detected recurring groups by merchant/subscription.
- Columns: Merchant, Avg Amount, Frequency, Next Date, Confidence.
- State actions: Confirm / Edit / Dismiss.
- Highlights for unusual amount or date drift.

### AI Advisor
- Chat layout with prompt suggestions:
  - “Where did my spending increase this month?”
  - “How much did I spend on dining in the last six months?”
  - “Help me create a grocery budget.”
  - “Find subscriptions I may no longer use.”
  - “Can I afford a $300 purchase based on my recent spending?”
- Every response includes:
  - Time period used
  - Categories considered
  - Totals and assumptions
  - “Why am I seeing this?”
- AI can propose actions, never auto-apply.

### Settings & Privacy
- Local database path + open-folder control.
- Import/export/backup/restore controls.
- Local model status (installed/not available/in use).
- Model selector + inference settings.
- Theme: Light / Dark / System.
- Persistent privacy text:
  - “Your financial data stays on this device.”
  - “AI analysis is processed locally.”
  - “No transaction data is uploaded.”

---

## 5) Important States and Edge Cases

- **No imported transactions:** onboarding empty state with “Import CSV” CTA.
- **CSV import in progress:** progress bar, parsed row count, cancel option.
- **Import errors:** row-level error table, downloadable error report, retry.
- **Uncategorized transactions:** dedicated filter and review queue badge.
- **Missing/unavailable AI model:** clear warning with setup steps; app remains usable.
- **AI processing in progress:** non-blocking spinner/skeleton and “analysis running” text.
- **No recurring expenses found:** informative empty state with detection criteria.
- **Budget exceeded:** warning card + suggested actions (reallocate, edit budget).
- **No data for chart:** placeholder text with selected timeframe context.

---

## 6) Recommended React Component Hierarchy

- `AppShell`
  - `SidebarNav`
  - `TopBar`
  - `PrivacyStatusStrip`
  - `MainContentRouter`
    - `OverviewPage`
      - `KpiCardGrid`
      - `CategorySpendChartCard`
      - `TrendChartCard`
      - `RecentTransactionsCard`
      - `UpcomingRecurringCard`
      - `AiSummaryCard`
    - `TransactionsPage`
      - `ImportDropzone`
      - `TransactionFilters`
      - `TransactionTable`
      - `BulkEditToolbar`
      - `TransactionDetailsPanel`
    - `BudgetsPage`
      - `BudgetSummaryCards`
      - `BudgetProgressList`
      - `AiBudgetSuggestionsPanel`
    - `RecurringPage`
      - `RecurringDetectionTable`
      - `RecurringReviewPanel`
    - `AdvisorPage`
      - `PromptSuggestionCards`
      - `AdvisorChatThread`
      - `AdvisorResponseEvidence`
    - `SettingsPrivacyPage`
      - `DatabaseSettingsCard`
      - `BackupExportCard`
      - `ModelSettingsCard`
      - `ThemeSettingsCard`
      - `PrivacyMessagingCard`

---

## 7) Reusable Components to Implement First

1. `Card`
2. `Button` (all variants)
3. `Input`, `Select`, `DateRangePicker`
4. `StatusBadge`
5. `ProgressBar`
6. `DataTable` (sorting/filtering/row select)
7. `EmptyState`
8. `AlertBanner`
9. `InsightExplanation` (“Why am I seeing this?”)
10. `ConfirmationDialog`
11. `ChartCard` wrapper (consistent title/legend/no-data handling)
12. `PrivacyPill` and `ModelStatusIndicator`

---

## 8) Example Microcopy

### Buttons
- “Import CSV”
- “Review Uncategorized”
- “Apply Suggestion”
- “Edit Before Applying”
- “Keep Current Category”

### Empty States
- “No transactions yet. Import a CSV to start tracking your spending.”
- “No recurring expenses detected yet. We’ll surface patterns after more data is available.”

### Warnings
- “You’re close to your Dining budget limit.”
- “This budget is exceeded by $84. Review recent transactions?”

### Privacy Notices
- “Your financial data stays on this device.”
- “AI analysis is processed locally.”
- “No transaction data is uploaded.”

### AI Response Style
- “Dining spending increased by 18% in Sep 2026 compared with Aug 2026 ($412 vs $349). This was mainly driven by 6 transactions at three merchants.”
- “I suggested a grocery budget of $520 based on your last 6 months median spend ($508) plus seasonal variance.”

---

## 9) Local SQLite + llama.cpp UX Recommendations

- Treat local storage/model details as **capabilities**, not technical burden:
  - Show “Ready / Not Ready / Needs Setup” states in plain language.
- Keep data trust visible:
  - Persistent local-only privacy indicator in app shell.
- Maintain explainability:
  - AI answers always include source period, categories, totals, and rationale.
- Preserve control:
  - AI suggestions enter a review queue; user confirmation required before write.
- Failure tolerant behavior:
  - If llama.cpp is unavailable, degrade gracefully to non-AI flows without blocking imports, categorization, or budget editing.
- Backup confidence:
  - Make export/backup obvious and recoverable from Settings.