import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAdvisorContext } from '../src/ai/financial-context.ts'
import { queryFinancialFacts } from '../src/ai/financial-facts.ts'
import { buildRecommendationPlan, checkRecommendationPlan } from '../src/ai/recommendation-plan.ts'
import { needsExplanation } from '../src/ai/advisor-report.ts'
import { assessExplanation } from '../src/ai/explanation-policy.ts'
import { reportToPlainText } from '../src/ai/advisor-presentation.ts'
import type { AdvisorReport } from '../src/ai/advisor-report.ts'
import type { LedgerTransaction } from '../src/finance/types.ts'
const rows: LedgerTransaction[] = ['Housing', 'Dining', 'Groceries', 'Uncategorized', 'Subscriptions', 'Transport'].map((category, i) => ({
  date: '2026-11-01', posted_date: '', amount: -[1200, 300, 200, 180, 60, 60][i], direction: 'outflow', category,
  category_source: 'manual', currency: 'USD', description: 'Synthetic', account: '', source_bank: '', external_id: String(i),
}))
const context = buildAdvisorContext(rows)
function planFor(question: string) {
  const query = queryFinancialFacts(context.facts, question, '2026-11-22', 'America/Detroit')
  assert.ok(!('error' in query))
  return buildRecommendationPlan(query, question)
}
test('save-more questions are recommendations, numeric comparisons stay deterministic', () => {
  assert.equal(needsExplanation('How can I save more money without changing my housing costs?'), true)
  assert.equal(needsExplanation('How can I spend less?'), true)
  assert.equal(needsExplanation('Compare October and November 2026.'), false)
})
test('review plan investigates unknown labels then prioritizes feasible categories using existing totals', () => {
  const plan = planFor('How can I save more money without changing my housing costs?')
  assert.deepEqual(plan.protectedCategories, ['Housing'])
  assert.deepEqual(plan.reviewCategories.map((r) => r.category), ['Uncategorized', 'Dining', 'Groceries', 'Subscriptions'])
  assert.match(plan.reviewCategories[0].instruction, /before deciding/)
  assert.ok(plan.reviewCategories.every((r) => r.currency === 'USD'))
})
test('real baseline false positives are accepted while inaccurate rankings still fail', () => {
  assert.equal(assessExplanation('- **Check Subscriptions**: Consider reviewing services before deciding whether any are unnecessary.', { categories: ['Subscriptions'], patterns: [] }).accepted, true)
  assert.equal(assessExplanation('Consider checking more affordable options when feasible.').accepted, true)
  assert.ok(assessExplanation('Dining is a leading outflow category.', { categories: ['Dining'], patterns: [] }).reasons.includes('unsupported_pattern'))
})
test('missing Uncategorized investigation and housing changes cannot pass plan checks', () => {
  const plan = planFor('How can I save more money without changing housing?')
  assert.ok(checkRecommendationPlan('Review Dining, Groceries and Subscriptions.', plan).includes('missing_grounding'))
  assert.ok(checkRecommendationPlan('Review Uncategorized, Dining, Groceries and Subscriptions. Reduce your rent.', plan).includes('constraint_violation'))
  assert.deepEqual(checkRecommendationPlan('Keep Housing unchanged. Investigate Uncategorized labels, then consider Dining, Groceries and Subscriptions.', plan), [])
})
test('plain report serialization includes category amounts and codes without depending on collapsed details', () => {
  const report: AdvisorReport = {
    asOfDate: '2026-11-22', timezone: 'America/Detroit', figures: [{ period: 'All imported records', startInclusive: '2026-11-01', endExclusive: '', endInclusive: '2026-11-01', currency: 'USD', coverage: 'unknown', transactions: 6,
      outflowCents: 200000, inflowCents: 0, netFlowCents: -200000, categories: [{ category: 'Dining', outflowCents: 30000 }] }],
    comparisons: [], notice: 'Coverage unverified.', explanation: 'Consider reviewing Dining.', explanationStatus: 'checked', explanationAttempts: [{ reasons: ['unknown_category'] }, { reasons: [] }],
  }
  const text = reportToPlainText(report)
  assert.match(text, /Dining: 300.00 USD/)
  assert.match(text, /Attempt 1: unknown_category/)
  assert.match(text, /Attempt 2: accepted/)
  assert.doesNotMatch(text, /^-\s*$/m)
})
