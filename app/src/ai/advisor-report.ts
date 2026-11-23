import { buildRecommendationPlan, checkRecommendationPlan } from './recommendation-plan.ts'
import { assessExplanation, normalizeUserAmountDisclaimer, type RejectionReason, type ExplanationEvidence } from './explanation-policy.ts'
import type { AdvisorContext } from './financial-context.ts'
import { ADVISOR_TIMEZONE, BALANCE_LIMITATION, calendarDate, queryFinancialFacts, qualitativeEvidence } from './financial-facts.ts'
import { DEFAULT_AI_TIMEOUT_MS, TruncatedAdvisorResponseError, explainLocalAdvisor, withLocalAdvisorDeadline, type AdvisorOptions } from './local-advisor.ts'

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
  categories: Array<{ category: string; outflowCents: number }>
}
export interface AdvisorReport {
  asOfDate: string
  timezone: string
  figures: FigureRow[]
  comparisons: Array<{ category?: string; currency: string; previousMonth: string; currentMonth: string; differenceCents: number; percentageChange: number | null }>
  explanationAttempts?: Array<{ reasons: RejectionReason[] }>
  notice: string
  explanation: string
  explanationStatus: 'checked' | 'withheld' | 'unavailable' | 'not_requested'
}

/** Compatibility wrapper; use assessExplanation for reason codes. */
export function screenExplanation(text: string): boolean { return assessExplanation(text).accepted }

export function needsExplanation(question: string): boolean {
  if (/\b(how much|total|percentage|difference|compare)\b/i.test(question) && !/\b(explain|why|suggest|recommend|advice|improve|should|help)\b/i.test(question)) return false
  if (/\bhow (?:can|could|do|should) i\b|\bways? to\b|\bspend less\b|\bcut (?:back|down)\b/i.test(question)) return true
  return /\b(explain|why|suggest|recommend|advice|budget|habits?|improve|focus|reducing|reduce|should|help|save|saving)\b/i.test(question)
}

export async function askAdvisorReport(question: string, context: AdvisorContext, signal?: AbortSignal, options: AdvisorOptions = {}): Promise<AdvisorReport> {
  const trimmed = question.trim()
  if (!trimmed || trimmed.length > 1000) throw new Error('Enter a question of at most 1,000 characters.')
  if (signal?.aborted) throw new Error('Request cancelled.')
  const now = options.now ?? new Date()
  const timezone = options.timezone ?? ADVISOR_TIMEZONE
  const asOfDate = calendarDate(now, timezone)
  const report: AdvisorReport = { asOfDate, timezone, figures: [], comparisons: [], notice: '', explanation: '', explanationStatus: 'not_requested' }
  if (/\bbalances?\b|how much (?:money )?(?:do i have|is in my account)/i.test(trimmed)) return { ...report, notice: BALANCE_LIMITATION }
  const query = queryFinancialFacts(context.facts, trimmed, asOfDate, timezone)
  if ('error' in query) return { ...report, notice: query.error! }
  for (const c of query.currencies) {
    if (query.requestedPeriods.length) {
      for (const period of c.periods) report.figures.push({ ...period, period: period.month, currency: c.currency })
    } else if (context.dataRange && c.allImported) {
      report.figures.push({ ...c.allImported, period: 'All imported records', startInclusive: context.dataRange.earliest, endExclusive: '', endInclusive: context.dataRange.latest, currency: c.currency, coverage: 'unknown' })
    }
    const comparison = c.comparison
    if (comparison.differenceCents !== undefined) {
      if (query.requestedCategories.length) {
        for (const category of comparison.categoryComparisons ?? []) if (query.requestedCategories.includes(category.category)) report.comparisons.push({ category: category.category, currency: c.currency, previousMonth: comparison.previousMonth!, currentMonth: comparison.currentMonth!, differenceCents: category.differenceCents, percentageChange: category.percentageChange })
      } else report.comparisons.push({ currency: c.currency, previousMonth: comparison.previousMonth!, currentMonth: comparison.currentMonth!, differenceCents: comparison.differenceCents, percentageChange: comparison.percentageChange! })
    }
  }
  report.notice = 'Coverage is unverified. Outflows and inflows are recorded money movements, not verified expenses or income. Net cash flow is inflows minus outflows, not a balance or savings. Transfers may be included; refunds are not matched to purchases.'
  if (!report.figures.length || report.figures.every((row) => row.coverage === 'no_records')) {
    report.notice = 'No imported records were found for the requested period. Spending is unknown; missing records do not establish zero spending.'
    return report
  }
  if (report.figures.some((row) => row.coverage === 'no_records')) report.notice += ' Some requested months have no records; complete-period spending comparisons are unsupported.'
  const plan = buildRecommendationPlan(query, trimmed)
  if (plan.protectedCategories.length) report.notice += ` Kept unchanged at your request: ${plan.protectedCategories.join(', ')}.`
  if (!needsExplanation(trimmed)) return report
  const evidence: ExplanationEvidence = qualitativeEvidence(query)
  // Snapshot labels and scope, not raw records or response contents, for diagnostics.
  report.explanationAttempts = []
  try {
    await withLocalAdvisorDeadline(signal, options.timeoutMs ?? DEFAULT_AI_TIMEOUT_MS, async (deadlineSignal) => {
      for (let attempt = 0; attempt < 2; attempt++) {
        let rawExplanation: string
        try {
          rawExplanation = await explainLocalAdvisor(trimmed, context, deadlineSignal, { ...options, now }, attempt === 1)
        } catch (error) {
          if (!(error instanceof TruncatedAdvisorResponseError)) throw error
          report.explanationAttempts!.push({ reasons: ['truncated_response'] })
          if (attempt === 0 && !deadlineSignal.aborted) continue
          throw error
        }
        const explanation = normalizeUserAmountDisclaimer(rawExplanation, trimmed)
        const assessment = assessExplanation(explanation, evidence)
        assessment.reasons.push(...checkRecommendationPlan(explanation, plan))
        assessment.accepted = assessment.reasons.length === 0
        report.explanationAttempts!.push({ reasons: assessment.reasons })
        if (assessment.accepted) {
          report.explanation = explanation
          report.explanationStatus = 'checked'
          return
        }
      }
      report.explanationStatus = 'withheld'
      report.explanation = `The local explanation could not meet the factual presentation rules after a retry. Review the verified figures above.${evidence.categories.length ? ` Consider reviewing these imported category labels: ${evidence.categories.join(', ')}.` : ''} Coverage and category labels need verification before setting a budget.`
    })
  } catch (error) {
    if (signal?.aborted) throw error
    report.explanationStatus = 'unavailable'
    report.explanation = error instanceof Error ? error.message : 'The local explanation is unavailable.'
  }
  return report
}
