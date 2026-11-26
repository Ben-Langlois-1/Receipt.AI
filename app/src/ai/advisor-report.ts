import { buildRecommendationPlan } from './recommendation-plan.ts'
import { assessExplanation, normalizeUserAmountDisclaimer } from './explanation-policy.ts'
import { assessAnswer, buildAnswerFacts, deterministicAnswer, shareOf, formatHundredths, type AdvisorIntent, type AnswerRejection } from './advisor-answer.ts'
import { buildRetryFeedback } from './advisor-retry.ts'
import type { AdvisorContext } from './financial-context.ts'
import { ADVISOR_TIMEZONE, BALANCE_LIMITATION, calendarDate, queryFinancialFacts } from './financial-facts.ts'
import { DEFAULT_AI_TIMEOUT_MS, TruncatedAdvisorResponseError, answerLocalAdvisor, withLocalAdvisorDeadline, type AdvisorOptions } from './local-advisor.ts'

export interface FigureRow {
  period: string
  startInclusive: string
  endExclusive: string
  endInclusive?: string
  currency: string
  coverage: 'unknown' | 'no_records'
  transactions: number
  outflowCents: number | null
  inflowCents: number | null
  netFlowCents: number | null
  categories: Array<{ category: string; outflowCents: number; share?: string }>
}
export type RejectionReason = AnswerRejection | 'truncated_response'
export interface AdvisorReport {
  asOfDate: string
  timezone: string
  intent?: AdvisorIntent
  figures: FigureRow[]
  comparisons: Array<{ category?: string; currency: string; previousMonth: string; currentMonth: string; differenceCents: number; percentageChange: number | null }>
  explanationAttempts?: Array<{ reasons: RejectionReason[] }>
  futureDatedRecords?: { transactions: number; earliest: string; latest: string }
  notice: string
  /** The direct answer shown first: the checked model answer, or an application-written one. */
  answer: string
  answerSource: 'ai' | 'app'
  /** checked: model answer accepted; withheld: rejected twice; unavailable: model error; not_requested: no model call needed. */
  explanationStatus: 'checked' | 'withheld' | 'unavailable' | 'not_requested'
  unavailableReason?: string
}

/** Compatibility wrapper; use assessExplanation for reason codes. */
export function screenExplanation(text: string): boolean { return assessExplanation(text).accepted }

export async function askAdvisorReport(question: string, context: AdvisorContext, signal?: AbortSignal, options: AdvisorOptions = {}): Promise<AdvisorReport> {
  const trimmed = question.trim()
  if (!trimmed || trimmed.length > 1000) throw new Error('Enter a question of at most 1,000 characters.')
  if (signal?.aborted) throw new Error('Request cancelled.')
  const now = options.now ?? new Date()
  const timezone = options.timezone ?? ADVISOR_TIMEZONE
  const asOfDate = calendarDate(now, timezone)
  const report: AdvisorReport = { asOfDate, timezone, figures: [], comparisons: [], notice: '', answer: '', answerSource: 'app', explanationStatus: 'not_requested' }
  const futureDates = context.dateCounts.filter((entry) => entry.date > asOfDate)
  if (futureDates.length) report.futureDatedRecords = {
    transactions: futureDates.reduce((sum, entry) => sum + entry.transactions, 0),
    earliest: futureDates[0].date,
    latest: futureDates.at(-1)!.date,
  }
  const futureNotice = report.futureDatedRecords
    ? ` Future-dated import warning: ${report.futureDatedRecords.transactions} imported transaction${report.futureDatedRecords.transactions === 1 ? '' : 's'} dated ${report.futureDatedRecords.earliest} through ${report.futureDatedRecords.latest} occur after the as-of date ${asOfDate}. They remain included in the displayed imported totals and category review; verify the dates before acting on them.`
    : ''
  const direct = (answer: string, notice = answer) => ({ ...report, answer, notice: notice + futureNotice })
  if (/\bbalances?\b|how much (?:money )?(?:do i have|is in my account)/i.test(trimmed)) return direct(BALANCE_LIMITATION)
  const query = queryFinancialFacts(context.facts, trimmed, asOfDate, timezone)
  if ('error' in query) return direct(query.error!)
  for (const c of query.currencies) {
    if (query.requestedPeriods.length) {
      for (const period of c.periods) report.figures.push({ ...period, period: period.month, currency: c.currency, categories: withShares(period.categories, period.outflowCents) })
    } else if (context.dataRange && c.allImported) {
      report.figures.push({ ...c.allImported, period: 'All imported records', startInclusive: context.dataRange.earliest, endExclusive: '', endInclusive: context.dataRange.latest, currency: c.currency, coverage: 'unknown', categories: withShares(c.allImported.categories, c.allImported.outflowCents) })
    }
    const comparison = c.comparison
    if (comparison.differenceCents !== undefined) {
      if (query.requestedCategories.length) {
        for (const category of comparison.categoryComparisons ?? []) if (query.requestedCategories.includes(category.category)) report.comparisons.push({ category: category.category, currency: c.currency, previousMonth: comparison.previousMonth!, currentMonth: comparison.currentMonth!, differenceCents: category.differenceCents, percentageChange: category.percentageChange })
      } else report.comparisons.push({ currency: c.currency, previousMonth: comparison.previousMonth!, currentMonth: comparison.currentMonth!, differenceCents: comparison.differenceCents, percentageChange: comparison.percentageChange! })
    }
  }
  report.notice = 'Coverage is unverified. Outflows and inflows are recorded money movements, not verified expenses or income. Net cash flow is inflows minus outflows, not a balance or savings. Transfers may be included; refunds are not matched to purchases.' + futureNotice
  if (!report.figures.length || report.figures.every((row) => row.coverage === 'no_records')) {
    const notice = 'No imported records were found for the requested period. Spending is unknown; missing records do not establish zero spending.'
    return { ...report, answer: notice, notice: notice + futureNotice }
  }
  if (report.figures.some((row) => row.coverage === 'no_records')) report.notice += ' Some requested months have no records; complete-period spending comparisons are unsupported.'
  const plan = buildRecommendationPlan(query, trimmed)
  if (plan.protectedCategories.length) report.notice += ` Kept unchanged at your request: ${plan.protectedCategories.join(', ')}.`
  const facts = buildAnswerFacts(query, trimmed, plan, context.dataRange)
  report.intent = facts.intent
  report.answer = deterministicAnswer(facts)
  // Snapshot rejection codes only, never response contents, for diagnostics.
  report.explanationAttempts = []
  try {
    await withLocalAdvisorDeadline(signal, options.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS, async (deadlineSignal) => {
      let feedback: string | undefined
      for (let attempt = 0; attempt < 2; attempt++) {
        let raw: string
        try {
          raw = await answerLocalAdvisor(trimmed, facts, deadlineSignal, { ...options, now }, feedback)
        } catch (error) {
          if (!(error instanceof TruncatedAdvisorResponseError)) throw error
          report.explanationAttempts!.push({ reasons: ['truncated_response'] })
          feedback = buildRetryFeedback(['truncated_response'], facts)
          if (attempt === 0 && !deadlineSignal.aborted) continue
          throw error
        }
        const answer = normalizeUserAmountDisclaimer(raw, trimmed)
        const reasons = assessAnswer(answer, facts, trimmed)
        report.explanationAttempts!.push({ reasons })
        if (!reasons.length) {
          report.answer = answer
          report.answerSource = 'ai'
          report.explanationStatus = 'checked'
          return
        }
        feedback = buildRetryFeedback(reasons, facts)
      }
      report.explanationStatus = 'withheld'
    })
  } catch (error) {
    if (signal?.aborted) throw error
    report.explanationStatus = 'unavailable'
    report.unavailableReason = error instanceof Error ? error.message : 'The local AI answer is unavailable.'
  }
  return report
}

function withShares(categories: Array<{ category: string; outflowCents: number }>, totalCents: number | null) {
  return categories.map(({ category, outflowCents }) => {
    const share = totalCents === null ? null : shareOf(outflowCents, totalCents)
    return { category, outflowCents, ...(share === null ? {} : { share: formatHundredths(share) }) }
  })
}
