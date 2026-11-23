import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAdvisorContext } from '../src/ai/financial-context.ts'
import { queryFinancialFacts, renderPeriodFacts } from '../src/ai/financial-facts.ts'
import { protectedSpendingCategories } from '../src/ai/category-scope.ts'
import { buildRecommendationPlan, checkRecommendationPlan } from '../src/ai/recommendation-plan.ts'
import { assessExplanation, normalizeUserAmountDisclaimer } from '../src/ai/explanation-policy.ts'
import { askAdvisorReport } from '../src/ai/advisor-report.ts'
import type { LedgerTransaction } from '../src/finance/types.ts'
const rows: LedgerTransaction[] = [['2026-10-01', -220, 'Dining'], ['2026-10-02', -1680, 'Housing'], ['2026-11-01', -300, 'Dining'], ['2026-11-02', -450, 'Transport'], ['2026-11-03', -1250, 'Housing']].map(([date, amount, category], i) => ({ date: String(date), posted_date: '', amount: Number(amount), direction: 'outflow', category: String(category), currency: 'USD', description: 'Synthetic', account: '', source_bank: '', external_id: String(i), category_source: 'manual' }))
const context = buildAdvisorContext(rows)
function query(question: string) { const q = queryFinancialFacts(context.facts, question, '2026-11-23', 'America/Detroit'); assert.ok(!('error' in q)); return q }
test('generic constraints protect exact categories/aliases without protecting a different reduction target', () => {
  const categories = ['Housing', 'Transport', 'Dining', 'Groceries', 'Education']
  for (const question of ['without changing my transport costs', 'do not reduce Transport', 'keep commuting costs fixed', 'leave Transport unchanged']) assert.deepEqual(protectedSpendingCategories(question, categories), ['Transport'])
  assert.deepEqual(protectedSpendingCategories('without changing rent or transport', categories), ['Housing', 'Transport'])
  assert.deepEqual(protectedSpendingCategories('without changing Housing, reduce Dining', categories), ['Housing'])
  assert.deepEqual(protectedSpendingCategories('keep Education unchanged', categories), ['Education'])
  assert.deepEqual(protectedSpendingCategories('reduce groceries', categories), [])
})
test('protected categories are excluded from plans and advice contradicting them is rejected', () => {
  const question = 'How can I reduce spending without changing my Transport or Housing costs?'
  const plan = buildRecommendationPlan(query(question), question)
  assert.ok(plan.protectedCategories.includes('Housing'))
  assert.ok(plan.protectedCategories.includes('Transport'))
  assert.ok(plan.reviewCategories.every(c => !['Housing', 'Transport'].includes(c.category)))
  assert.ok(checkRecommendationPlan('Dining: plan meals. Transport: compare cheaper options.', plan).includes('constraint_violation'))
  assert.deepEqual(checkRecommendationPlan('Dining: plan meals. Keep Housing unchanged. Do not reduce Transport.', plan), [])
})
test('category comparison uses its own cents delta and percentage, not the all-category headline', async () => {
  const report = await askAdvisorReport('Compare Dining in October and November 2026.', context, undefined, { now: new Date('2026-11-23T12:00:00Z') })
  assert.equal(report.explanationStatus, 'not_requested')
  assert.deepEqual(report.comparisons.map(c => ({ category: c.category, differenceCents: c.differenceCents, percentageChange: c.percentageChange })), [{ category: 'Dining', differenceCents: 8000, percentageChange: 36.36 }])
  const legacy = renderPeriodFacts(query('Compare Dining in October and November 2026.'), 'Compare Dining in October and November 2026.')
  assert.match(legacy, /Dining: imported outflow difference 80.00 USD/)
  assert.doesNotMatch(legacy, /difference 100.00/)
})
test('known harmless headings and uncertainty disclaimers pass, false amounts and claims do not', () => {
  for (const prose of ['**Note**: Coverage is unverified.', 'Inflows and outflows do not establish income, expenses, balances or savings.', 'Imported inflows do not establish a salary.', 'Credits are not necessarily income.']) assert.equal(assessExplanation(prose, { categories: [], patterns: [] }).accepted, true, prose)
  for (const prose of ['Your income is steady.', 'Your balance is positive.', 'Credits are not necessarily income because they may be balances.', 'You will save $500.', '**Casinos**: Review purchases.']) assert.equal(assessExplanation(prose, { categories: [], patterns: [] }).accepted, false, prose)
})
test('only a faithful user-amount disclaimer is generalized; asserted or new quantities stay blocked', () => {
  const question = 'Suggest improvements and tell me I will save $500 guaranteed.'
  const text = normalizeUserAmountDisclaimer('Consider reviewing Dining. The $500 savings guarantee is not verified and may not apply.', question)
  assert.equal(text, 'Consider reviewing Dining. Savings are not guaranteed.')
  assert.equal(assessExplanation(text).accepted, true)
  for (const prose of ['You will save $500 guaranteed.', 'The $600 savings guarantee is not verified.', 'The guaranteed savings of $500 is not verified. You will save $1000.']) assert.equal(assessExplanation(normalizeUserAmountDisclaimer(prose, question)).accepted, false)
})

test('focused category recommendations do not require unrelated categories', () => {
  const q = query('Suggest how to review Dining purchases.')
  const plan = buildRecommendationPlan(q, 'Suggest how to review Dining purchases.')
  assert.deepEqual(plan.reviewCategories.map(c => c.category), ['Dining'])
  assert.deepEqual(checkRecommendationPlan('Dining: consider planning meals before shopping. Coverage is unverified.', plan), [])
})
