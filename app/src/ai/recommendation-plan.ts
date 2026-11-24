import { protectedSpendingCategories, mentionsCategory } from './category-scope.ts'
import type { queryFinancialFacts } from './financial-facts.ts'
type Query = Exclude<ReturnType<typeof queryFinancialFacts>, { error: string }>
export interface RecommendationPlan {
  protectedCategories: string[]
  reviewCategories: Array<{ category: string; currency: string; instruction: string }>
}
const actions: Record<string, string> = {
  Uncategorized: 'Investigate the underlying transactions and correct category labels before deciding what could be reduced. Do not assume these are discretionary purchases.',
  Dining: 'Plan restaurant visits, bring lunch, or cook when feasible. Essential purchases may still be necessary.',
  Groceries: 'Check the pantry, use a shopping list, and plan meals to avoid waste.',
  Subscriptions: 'Check whether the labeled services are still used before considering cancellation; the label does not prove active recurring charges.',
  Transport: 'Compare feasible travel options or combine trips when practical, while respecting essential travel needs.',
}
export function buildRecommendationPlan(query: Query, question: string): RecommendationPlan {
  const labels = query.currencies.flatMap(c => (c.requestedRecordTotals?.categories ?? c.allImported?.categories ?? []).map(r => r.category))
  const protectedCategories = protectedSpendingCategories(question, labels)
  const focused = query.requestedCategories.filter(category => !protectedCategories.includes(category) && !['Transfers', 'Income'].includes(category))
  const reviewCategories: RecommendationPlan['reviewCategories'] = []
  for (const c of query.currencies) {
    // Existing integer-cent rankings, per currency; no cross-currency arithmetic.
    const ranked = c.requestedRecordTotals?.categories ?? c.allImported?.categories ?? []
    const eligible = ranked.filter((r) => r.outflowCents > 0 && !['Transfers', 'Income', ...protectedCategories].includes(r.category) && (r.category !== 'Housing' || focused.includes('Housing')) && (!focused.length || r.category === 'Uncategorized' || focused.includes(r.category)))
    const unknown = eligible.find((r) => r.category === 'Uncategorized')
    const ordered = [...(unknown ? [unknown] : []), ...eligible.filter((r) => r.category !== 'Uncategorized').slice(0, 3)]
    for (const entry of ordered) reviewCategories.push({ category: entry.category, currency: c.currency,
      instruction: actions[entry.category] ?? 'Review the underlying purchases and distinguish essential from optional needs before considering changes.' })
  }
  return { protectedCategories, reviewCategories }
}

/** Quality checks require evidence-grounded category references, never fabricated figures. */
export function checkRecommendationPlan(text: string, plan: RecommendationPlan): Array<'missing_grounding' | 'unexpected_category' | 'constraint_violation'> {
  const reasons: Array<'missing_grounding' | 'unexpected_category' | 'constraint_violation'> = []
  const lower = text.toLowerCase()
  // A response remains grounded when it gives a useful subset of the verified
  // plan. Requiring every ranked category caused otherwise safe Qwen answers to
  // be discarded. Two distinct plan categories (or the sole category) retain
  // personalization without accepting generic advice.
  const grounded = plan.reviewCategories.filter((r) => lower.includes(r.category.toLowerCase())).length
  if (grounded < Math.min(2, plan.reviewCategories.length)) reasons.push('missing_grounding')
  const planned = new Set(plan.reviewCategories.map(item => item.category.toLowerCase()))
  for (const match of text.matchAll(/^\s*(?:[-*]\s*)?\*\*([^*\n]+)\*\*\s*:/gm)) {
    if (!planned.has(match[1].trim().toLowerCase())) reasons.push('unexpected_category')
  }
  const prose = text.replace(/[*_`]/g, '')
  for (const category of plan.protectedCategories) {
    // Reject references unless the entire line explicitly preserves this category.
    // This intentionally fails closed for unfamiliar wording instead of allowing a
    // protected heading followed by an instruction on a different line.
    const lines = prose.split(/[\n.!?]+/).filter(line => mentionsCategory(line, category))
    if (lines.some(line => {
      const normalized = line.replace(/\b(?:do not|don't|never|without|not)\s+(?:(?:suggest|recommend)\s+)?(?:change|changing|reduce|reducing|cut|cutting|lower|lowering|adjust|adjusting|touch|touching)\b/gi, 'preserve')
      return !/preserve|unchanged|fixed|as is|the same/i.test(normalized) || /\b(?:reduce|cut|lower|renegotiate|replace|cancel|combine|compare|move|relocate)\b/i.test(normalized)
    })) reasons.push('constraint_violation')
  }
  return [...new Set(reasons)]
}

/** Safe application-authored guidance when both model attempts are rejected. */
export function renderRecommendationFallback(plan: RecommendationPlan): string {
  const lines = ['Application-generated fallback (not AI-generated):']
  if (plan.reviewCategories.length) {
    for (const item of plan.reviewCategories) lines.push(`- **${item.category}**: ${item.instruction}`)
  } else {
    lines.push('- Review the underlying imported transactions and verify their category labels before considering changes.')
  }
  lines.push('Coverage is unverified and category labels need checking; these are options, not guaranteed outcomes.')
  return lines.join('\n')
}
