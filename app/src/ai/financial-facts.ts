import { mentionsCategory } from './category-scope.ts'
import { summarize } from '../finance/summary.ts'
import { toCents } from '../finance/money.ts'
import { parseDate } from '../finance/dates.ts'
import type { LedgerTransaction } from '../finance/types.ts'

export const ADVISOR_TIMEZONE = 'America/Detroit'
export function calendarDate(now = new Date(), timezone = ADVISOR_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (name: string) => parts.find((p) => p.type === name)!.value
  return `${part('year')}-${part('month')}-${part('day')}`
}
export function shiftMonth(month: string, offset: number): string {
  const [year, number] = month.split('-').map(Number)
  const date = new Date(Date.UTC(year, number - 1 + offset, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}
export function monthBounds(month: string) {
  return { startInclusive: `${month}-01`, endExclusive: `${shiftMonth(month, 1)}-01` }
}
export function validAdvisorRows(rows: LedgerTransaction[]): LedgerTransaction[] {
  return rows.filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && parseDate(r.date) === r.date &&
    Number.isFinite(r.amount) && Number.isSafeInteger(toCents(r.amount)) &&
    (r.direction === 'inflow' || r.direction === 'outflow') &&
    (r.amount === 0 || (r.direction === 'inflow' ? r.amount > 0 : r.amount < 0)))
    .map((r) => ({ ...r, currency: r.currency.trim().toUpperCase() || 'Unknown', category: r.category.trim() || 'Uncategorized' }))
}
function safe(value: number): number {
  if (!Number.isSafeInteger(value)) throw new Error('Financial totals exceed safe integer precision.')
  return value
}
export function percentageChange(current: number, previous: number): number | null {
  if (![current, previous].every(Number.isSafeInteger) || current < 0 || previous < 0) throw new Error('Expected nonnegative integer cents.')
  if (previous === 0) return null
  // BigInt keeps percentage rounding exact; hundredths of a percent, half away from zero.
  const numerator = (BigInt(current) - BigInt(previous)) * 10000n
  const magnitude = numerator < 0n ? -numerator : numerator
  const rounded = (magnitude * 2n + BigInt(previous)) / (2n * BigInt(previous))
  return Number(numerator < 0n ? -rounded : rounded) / 100
}
function facts(rows: LedgerTransaction[]) {
  const summary = summarize(rows)
  return {
    transactions: rows.length,
    outflowCents: safe(summary.outflowCents), inflowCents: safe(summary.inflowCents), netFlowCents: safe(summary.netCents),
    categories: summary.byCategory.map((c, index) => ({ rank: index + 1, category: c.category, outflowCents: safe(c.outflowCents) })),
    transferOutflowCents: safe(summarize(rows.filter((r) => r.category === 'Transfers')).outflowCents),
    unclassifiedInflowCents: safe(summary.inflowCents),
    verifiedIncomeCents: null,
    verifiedExpenseCents: null,
  }
}
export function buildFinancialFacts(rows: LedgerTransaction[]) {
  const currencies = [...new Set(rows.map((r) => r.currency))].sort()
  const latestImportedMonth = rows.map((r) => r.date.slice(0, 7)).sort().at(-1) ?? null
  return {
    metricDefinitions: { outflow: 'Money leaving accounts: outflow-direction records only, excluding all inflows.', inflow: 'Money entering accounts: inflow-direction records only, excluding all outflows.', netFlow: 'Inflows minus outflows; not an account balance.' },
    latestImportedMonth,
    currencies: currencies.map((currency) => {
      const selected = rows.filter((r) => r.currency === currency)
      const months = [...new Set(selected.map((r) => r.date.slice(0, 7)))].sort()
      return { currency, allImported: facts(selected), months: months.map((month) => ({
        month, ...monthBounds(month), coverage: 'unknown' as const,
        ...facts(selected.filter((r) => r.date.startsWith(month))),
      })) }
    }),
    limitations: [
      'Coverage is unknown: records do not prove a complete statement, account set, or month. No verified zero spending is available.',
      'Outflows include transfers and other movements; they are not verified expenses. Inflows may be transfers, refunds, reimbursements or deposits, not verified income.',
      'Refunds are shown as inflows; no matching metadata exists to subtract them from purchases.',
      'Net flow is not balance, savings, disposable income or affordability. Categories are unverified labels.',
      'Comparisons describe imported records only; actual spending comparisons are unsupported with unknown coverage.',
      'All amounts use integer cents (two decimal places); never combine currencies. No balances, budgets or recurring detector results are supplied.',
    ],
  }
}
export type FinancialFacts = ReturnType<typeof buildFinancialFacts>

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
export function resolvePeriod(question: string, today: string, latest: string | null) {
  const q = question.toLowerCase()
  const current = today.slice(0, 7)
  const months: string[] = []
  for (const match of q.matchAll(/\b(\d{4})-(\d{2})\b/g)) {
    if (+match[2] < 1 || +match[2] > 12) return { error: 'Please specify a valid calendar month.' }
    months.push(match[0])
  }
  const named = [...q.matchAll(new RegExp(`\\b(${MONTHS.join('|')})(?:\\s+(\\d{4}))?\\b`, 'g'))]
  const explicitYears = [...new Set(named.flatMap((match) => match[2] ? [match[2]] : []))]
  if (named.some((m) => !m[2]) && named.some((m, i) => i > 0 && MONTHS.indexOf(m[1]) < MONTHS.indexOf(named[i - 1][1]))) return { error: 'Please specify a year for each month across a year boundary.' }
  for (const match of named) {
    // Share one stated year across coordinated month names. Multiple years require
    // each month to carry its own year, especially across December/January.
    const year = match[2] ?? (explicitYears.length === 1 ? explicitYears[0] : undefined)
    if (!year) return { error: 'Please include an unambiguous year with each month name.' }
    months.push(`${year}-${String(MONTHS.indexOf(match[1]) + 1).padStart(2, '0')}`)
  }
  if (/\bthis month\b/.test(q)) months.push(current)
  if (/\b(last|previous) month\b/.test(q)) months.push(shiftMonth(current, -1))
  if (/latest (two|2) months/.test(q) && latest) months.push(shiftMonth(latest, -1), latest)
  else if (/latest (imported )?month/.test(q) && latest) months.push(latest)
  if (/last six months/.test(q)) months.push(...Array.from({ length: 6 }, (_, i) => shiftMonth(current, i - 5)))
  if (/\b(today|yesterday|week|days?|year to date|last year|this year|quarter)\b/.test(q) || /\d{4}-\d{2}-\d{2}/.test(q)) {
    return { error: 'This advisor currently supports calendar-month queries. Please specify months and years.' }
  }
  if (/\bbetween\b|\bfrom\b.+\bto\b/.test(q) && months.length > 1) return { error: 'Please ask about individual calendar months; date ranges are not supported yet.' }
  if (!months.length && /\b(months?|years?|since|ago|recent|weekly|monthly|annually)\b/.test(q)) return { error: 'Please specify a supported calendar month and year, this month, last month, or last six months.' }
  return { months: [...new Set(months)].sort() }
}
export function queryFinancialFacts(facts: FinancialFacts, question: string, today: string, timezone: string) {
  const period = resolvePeriod(question, today, facts.latestImportedMonth)
  if (period.error) return { error: period.error }
  const requested = period.months ?? []
  const requestedCategories = [...new Set(facts.currencies.flatMap(c => c.allImported.categories.map(item => item.category)))].filter(category => mentionsCategory(question, category))
  const comparisonRequested = /compar|difference|increase|decrease|change|versus|\bvs\b/i.test(question)
  return {
    asOfDate: today, timezone, latestImportedMonth: facts.latestImportedMonth,
    requestedCategories,
    requestedPeriods: requested.map((month) => ({ month, ...monthBounds(month) })),
    metricDefinitions: facts.metricDefinitions,
    limitations: facts.limitations,
    currencies: facts.currencies.map((c) => {
      const selected = requested.map((month) => c.months.find((m) => m.month === month) ?? {
        month, ...monthBounds(month), coverage: 'no_records' as const, transactions: 0,
        outflowCents: null, inflowCents: null, netFlowCents: null, categories: [],
      })
      const [previous, current] = selected
      const comparable = comparisonRequested && selected.length === 2 && previous.outflowCents !== null && current.outflowCents !== null
      const names = [...new Set(selected.flatMap((p) => p.categories.map((item) => item.category)))]
      const categories = names.map((category) => ({ category, outflowCents: safe(selected.reduce((sum, p) => sum + (p.categories.find((item) => item.category === category)?.outflowCents ?? 0), 0)) })).sort((a, b) => b.outflowCents - a.outflowCents || a.category.localeCompare(b.category))
      return { currency: c.currency, periods: selected,
        requestedRecordTotals: requested.length ? {
          scope: 'found imported records only; missing months are not verified zeros',
          outflowCents: safe(selected.reduce((sum, p) => sum + (p.outflowCents ?? 0), 0)), categories,
          missingMonths: selected.filter((p) => p.coverage === 'no_records').map((p) => p.month),
        } : undefined, ...(requested.length ? {} : { allImported: c.allImported }),
        comparison: comparable ? {
          scope: 'imported records only; actual spending comparison unsupported',
          previousMonth: previous.month, currentMonth: current.month,
          differenceCents: safe(current.outflowCents! - previous.outflowCents!),
          percentageChange: percentageChange(current.outflowCents!, previous.outflowCents!),
          categoryComparisons: [...new Set([...previous.categories, ...current.categories].map((c) => c.category))].map((category) => {
            const before = previous.categories.find((c) => c.category === category)?.outflowCents ?? 0
            const after = current.categories.find((c) => c.category === category)?.outflowCents ?? 0
            return { category, previousOutflowCents: before, currentOutflowCents: after, differenceCents: safe(after - before), percentageChange: percentageChange(after, before) }
          }),
          percentageUnavailableReason: previous.outflowCents === 0 ? 'zero baseline' : null,
        } : { scope: 'unsupported', reason: 'Requires exactly two months with imported records; complete coverage is never verified.' },
      }
    }),
  }
}

/** Attach exact decimal strings so the model need not convert cents itself. */
export function displayFinancialFacts(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(displayFinancialFacts)
  if (value === null || typeof value !== 'object') return value
  const result: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    result[key] = displayFinancialFacts(entry)
    if (key.endsWith('Cents') && typeof entry === 'number') {
      const magnitude = Math.abs(entry)
      result[key.replace(/Cents$/, 'Amount')] = `${entry < 0 ? '-' : ''}${Math.trunc(magnitude / 100)}.${String(magnitude % 100).padStart(2, '0')}`
    }
  }
  return result
}

export const BALANCE_LIMITATION = 'An account balance cannot be established from these imported transaction totals. It requires a verified opening balance and sufficiently complete transaction history for the same account and period, or an actual verified account balance with an as-of date. Net transaction flow is not an account balance.'

export function formatCents(cents: number): string {
  const magnitude = Math.abs(cents)
  return `${cents < 0 ? '-' : ''}${Math.trunc(magnitude / 100)}.${String(magnitude % 100).padStart(2, '0')}`
}

/** Monthly numerical answers are rendered by the app; model prose cannot relabel them. */
export function renderPeriodFacts(query: Exclude<ReturnType<typeof queryFinancialFacts>, { error: string }>, question: string): string {
  const compare = /compar|difference|increase|decrease|change|versus|\bvs\b/i.test(question)
  const lines: string[] = []
  for (const currency of query.currencies) {
    for (const period of currency.periods) {
      if (period.outflowCents === null) {
        lines.push(`${period.month} (${currency.currency}): No imported transactions were found. Spending is unknown; this does not establish zero spending.`)
      } else {
        lines.push(`${period.month} (${currency.currency}): Imported outflows ${formatCents(period.outflowCents)}; imported inflows ${formatCents(period.inflowCents!)}. Outflows exclude inflows and include any transfers recorded as outflows.`)
        for (const category of period.categories) lines.push(`  ${category.category}: outflows ${formatCents(category.outflowCents)} ${currency.currency}.`)
      }
    }
    if (compare) {
      const comparison = currency.comparison
      if (comparison.differenceCents !== undefined) {
        if (!query.requestedCategories.length) lines.push(`${comparison.currentMonth} versus ${comparison.previousMonth}: imported outflow difference ${formatCents(comparison.differenceCents)} ${currency.currency}; percentage change ${comparison.percentageChange === null ? 'unavailable (zero baseline)' : `${comparison.percentageChange}%`}.`)
        for (const category of comparison.categoryComparisons ?? []) if (!query.requestedCategories.length || query.requestedCategories.includes(category.category)) lines.push(`${category.category}: imported outflow difference ${formatCents(category.differenceCents)} ${currency.currency}; percentage change ${category.percentageChange === null ? 'unavailable (zero baseline)' : `${category.percentageChange}%`}.`)
      } else lines.push('Comparison unavailable: two months with imported records are required.')
    }
  }
  lines.push(`Coverage is unverified (${query.timezone}); imported totals do not establish complete spending, income, expenses, or a balance.`)
  return lines.join('\n')
}

/** Qualitative evidence is derived from existing cents totals, never model inference. */
export function qualitativeEvidence(query: Exclude<ReturnType<typeof queryFinancialFacts>, { error: string }>) {
  const categories = new Set<string>()
  const patterns: string[] = []
  for (const currency of query.currencies) {
    const ranked = currency.requestedRecordTotals?.categories ?? currency.allImported?.categories ?? []
    for (const category of ranked) categories.add(category.category)
    const maximum = ranked[0]?.outflowCents ?? 0
    if (maximum > 0) for (const category of ranked.filter((c) => c.outflowCents === maximum)) {
      patterns.push(`${category.category} is a leading outflow category in the selected imported records (${currency.currency}).`)
    }
  }
  return { categories: [...categories], patterns }
}
