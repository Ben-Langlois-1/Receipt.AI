import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import { assessAnswer, buildAnswerFacts, classifyIntent, deterministicAnswer, factsForModel, shareOf } from '../src/ai/advisor-answer.ts'
import { askAdvisorReport } from '../src/ai/advisor-report.ts'
import { AdvisorResponse, reportToPlainText } from '../src/ai/advisor-presentation.ts'
import { buildAdvisorContext } from '../src/ai/financial-context.ts'
import { queryFinancialFacts } from '../src/ai/financial-facts.ts'
import { buildRecommendationPlan } from '../src/ai/recommendation-plan.ts'
import { importStatement } from '../src/finance/import-statement.ts'
import type { LedgerTransaction } from '../src/finance/types.ts'

const require = createRequire(import.meta.url)
const { csvFor } = require('../benchmarks/suite.cjs')
const balanced = buildAdvisorContext(importStatement(csvFor('balanced')).transactions)
// The complete eight-category ledger from fixtures/banks/chase-checking.csv (Housing 91.33%).
const housing = buildAdvisorContext(importStatement(csvFor('chaseChecking')).transactions)
const options = { model: 'receiptai-local', now: new Date('2026-11-23T17:00:00-05:00'), timezone: 'America/Detroit' }
function factsFor(context: typeof balanced, question: string) {
  const query = queryFinancialFacts(context.facts, question, '2026-11-23', 'America/Detroit')
  assert.ok(!('error' in query))
  return buildAnswerFacts(query, question, buildRecommendationPlan(query, question), context.dataRange)
}
function model(t: TestContext, answers: string[]) {
  const original = globalThis.fetch
  const bodies: Array<{ system: string; user: string }> = []
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    bodies.push({ system: body.messages[0].content, user: body.messages[1].content })
    const answer = answers[bodies.length - 1]
    assert.ok(answer !== undefined, 'Unexpected extra generation')
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: answer } }] }))
  }) as typeof fetch
  return bodies
}

test('routing answers every natural-language question; constraints are not comparisons', () => {
  assert.equal(classifyIntent('Where did most of my money go?'), 'breakdown')
  assert.equal(classifyIntent('Compare the latest two months of spending.'), 'comparison')
  assert.equal(classifyIntent('What should I do to improve my spending habits?'), 'advice')
  assert.equal(classifyIntent('How can I save more money without changing my housing costs?'), 'advice')
  assert.equal(classifyIntent('How can I reduce spending without changing my transport costs?'), 'advice')
  assert.equal(classifyIntent('How much did I spend on dining?'), 'lookup')
  assert.equal(classifyIntent('What changed in my spending?'), 'comparison')
})

test('shares use exact integer rounding and classify the user example', () => {
  assert.equal(shareOf(280000, 306575), 9133)
  assert.equal(shareOf(1, 3), 3333)
  assert.equal(shareOf(2, 3), 6667)
  const facts = factsFor(housing, 'Where did most of my money go?')
  const usd = facts.currencies[0]
  assert.equal(usd.totals.outflows, '3065.75 USD')
  assert.deepEqual(usd.categories.map((c) => [c.category, c.outflows, c.share, c.tier, c.essential]), [
    ['Housing', '2800.00 USD', '91.33%', 'dominant', true],
    ['Groceries', '86.42 USD', '2.82%', 'minor', false],
    ['Utilities', '62.10 USD', '2.03%', 'minor', true],
    ['Transport', '42.18 USD', '1.38%', 'minor', false],
    ['Shopping', '34.12 USD', '1.11%', 'minor', false],
    ['Subscriptions', '31.98 USD', '1.04%', 'minor', false],
    ['Dining', '6.45 USD', '0.21%', 'minor', false],
    ['Fees', '2.50 USD', '0.08%', 'minor', false],
  ])
  assert.deepEqual(usd.remainderAfterLargest, { outflows: '265.75 USD', share: '8.67%', categoryCount: 7 })
  assert.ok(facts.keyPoints.some((p) => p.includes('Housing is the largest category: 2800.00 USD, 91.33% of 3065.75 USD')))
  // The model sees display strings only, never integer cents used for checks.
  assert.doesNotMatch(JSON.stringify(factsForModel(facts)), /Cents|Hundredths/)
})

test('the complete original eight-category Chase import drives every advisor figure', async (t) => {
  const imported = importStatement(fs.readFileSync(new URL('../fixtures/banks/chase-checking.csv', import.meta.url), 'utf8'))
  assert.equal(imported.ok, true)
  assert.equal(imported.transactions.length, 12, 'the malformed row is skipped, all 12 valid rows are kept')
  const context = buildAdvisorContext(imported.transactions)
  // The canonical fixture used by the e2e and evaluation is exactly this ledger.
  assert.deepEqual(context.facts, housing.facts)
  assert.deepEqual(context.dataRange, { earliest: '2026-01-03', latest: '2026-02-15' })
  const question = 'Where did most of my money go?'
  const facts = factsFor(context, question)
  const usd = facts.currencies[0]
  assert.deepEqual(usd.totals, { outflows: '3065.75 USD', inflows: '4900.00 USD', netCashFlow: '1834.25 USD' })
  assert.equal(usd.scope, 'all imported records, 2026-01-03 through 2026-02-15')
  // The denominator is the selected dataset: category amounts sum to it, ranks follow it.
  assert.equal(usd.categories.reduce((sum, c) => sum + c.outflowCents, 0), usd.outflowCents)
  assert.equal(usd.outflowCents, 306575)
  assert.deepEqual(usd.categories.map((c) => c.rank), [1, 2, 3, 4, 5, 6, 7, 8])
  assert.equal(usd.categories.at(-1)!.category, 'Fees')
  assert.equal(usd.remainderAfterLargest!.outflows, '265.75 USD')
  // Figures from a four-category subset of this ledger are fabricated for the full dataset.
  for (const wrong of ['2990.70 USD', '93.62%', '190.70 USD', '6.38%', '2.89%']) {
    const reasons = assessAnswer(`Most of your money went to Housing (2800.00 USD), with ${wrong} noted.`, facts, question)
    assert.ok(reasons.includes('ungrounded_number'), `${wrong}: ${reasons}`)
  }
  assert.deepEqual(assessAnswer('Most of your money went to Housing: 2800.00 USD, 91.33% of 3065.75 USD. Everything else is 265.75 USD (8.67%) across seven minor categories, led by Groceries (86.42 USD).', facts, question), [])
  // The month comparison uses the same ledger.
  const compare = factsFor(context, 'Compare the latest two months of spending.').currencies[0].comparison!
  assert.deepEqual([compare.previousMonth, compare.previousOutflows, compare.currentMonth, compare.currentOutflows, compare.change, compare.percentChange], ['2026-01', '1649.76 USD', '2026-02', '1415.99 USD', '-233.77 USD', '-14.17%'])
  // End to end: a model answer using the subset denominator is never shown.
  const bodies = model(t, ['Most of your money went to Housing: 2800.00 USD, 93.62% of 2990.70 USD.', 'Most of your money went to Housing: 2800.00 USD, 91.33% of 3065.75 USD.'])
  const report = await askAdvisorReport(question, context, undefined, options)
  assert.equal(bodies.length, 2)
  assert.ok(report.explanationAttempts![0].reasons.includes('ungrounded_number'))
  assert.equal(report.answer, 'Most of your money went to Housing: 2800.00 USD, 91.33% of 3065.75 USD.')
  assert.match(bodies[0].user, /"outflows":"3065\.75 USD"/)
  assert.doesNotMatch(bodies[0].user, /2990\.70|93\.62/)
})

test('essential expenses may be described but not indirectly targeted unless the user asks', () => {
  const habitsQ = 'What should I do to improve my spending habits?', habits = factsFor(housing, habitsQ)
  const reduceQ = 'How can I reduce my spending?', reduce = factsFor(housing, reduceQ)
  // Descriptive, explanatory statements about essential spending are accepted.
  for (const [text, facts, question] of [
    ['Housing is 91.33% of your imported outflows and is usually an essential, fixed cost. Groceries (2.82%) is the largest flexible category, so a shopping list may help a little.', habits, habitsQ],
    ['Your essential expenses, mainly Housing at 2800.00 USD, drive the total. Fixed costs like Housing and Utilities are usually hard to change; plan meals to trim Groceries instead.', habits, habitsQ],
    ['Housing is 91.33% of your outflows. Rather than cutting essential expenses, look at Groceries (86.42 USD) and Transport (42.18 USD) for small changes.', reduce, reduceQ],
    ['Housing is your largest expense at 91.33%. Because fixed costs dominate, changes in the other categories have a limited effect; combining trips may still help with Transport.', reduce, reduceQ],
    ['Housing is 91.33% of your outflows. Without changing your essential expenses, you could plan meals to reduce Groceries.', reduce, reduceQ],
    ['Your fixed costs are 91.33% of outflows. For Groceries, use a shopping list.', habits, habitsQ],
  ] as const) assert.deepEqual(assessAnswer(text, facts, question), [], text)
  // Qualified rankings must still be true.
  assert.ok(assessAnswer('Housing is 91.33%. Transport (1.38%) is the largest flexible category.', habits, habitsQ).includes('ranking_claim'))
  // Indirect recommendations to act on essential spending are rejected.
  for (const [text, facts, question] of [
    ['Housing is 91.33% of your outflows. Consider reviewing your essential expenses and ensuring they are necessary and reasonable.', habits, habitsQ],
    ['Housing is 91.33% of your outflows. Look for ways to lower your fixed costs.', reduce, reduceQ],
    ['Housing is 91.33% of your outflows. Your fixed costs could be renegotiated.', reduce, reduceQ],
    ['Housing is 91.33% of your outflows. Reconsider your biggest expense.', reduce, reduceQ],
    ['Housing is 91.33% of your outflows. Your essential expenses are high. Consider reviewing them.', habits, habitsQ],
    ['Housing is 91.33% of your outflows. Make sure your essential bills are necessary by auditing your essential bills.', habits, habitsQ],
    ['Housing is 91.33% of your outflows. You could rethink your fixed costs to save more.', reduce, reduceQ],
    ['Housing is 91.33% of your outflows. Optimizing your core living expenses could help.', reduce, reduceQ],
    // Accepted by the previous checker in a real Qwen3 run on this ledger.
    ['Your largest expense is housing, which is usually an essential cost and drives the total spending. Since housing is dominant, consider how you can optimize its budget.', habits, habitsQ],
  ] as const) assert.ok(assessAnswer(text, facts, question).includes('constraint_violation'), text)
  // When the user explicitly asks about fixed costs, discussing changes to them is allowed.
  const fixedQ = 'How can I lower my fixed costs?', fixed = factsFor(housing, fixedQ)
  assert.ok(!assessAnswer('Housing is 91.33% of your outflows. Reviewing your fixed costs, such as Housing at a lease renewal, is a larger decision.', fixed, fixedQ).includes('constraint_violation'))
  // A protected category stays protected even then.
  const protectedQ = 'How can I lower my fixed costs without changing my housing?', kept = factsFor(housing, protectedQ)
  assert.ok(assessAnswer('Housing is 91.33% of your outflows. Consider reducing your rent.', kept, protectedQ).includes('constraint_violation'))
})

test('deterministic answers directly address the exact questions', () => {
  const where = deterministicAnswer(factsFor(housing, 'Where did most of my money go?'))
  assert.match(where, /^Most of your imported outflows went to Housing: 2800\.00 USD, 91\.33% of 3065\.75 USD \(all imported records, 2026-01-03 through 2026-02-15\)/)
  assert.match(where, /Groceries \(86\.42 USD, 2\.82%\), Utilities \(62\.10 USD, 2\.03%\) and Transport \(42\.18 USD, 1\.38%\), plus 4 smaller categories/)
  const compare = deterministicAnswer(factsFor(balanced, 'Compare the latest two months of spending.'))
  assert.match(compare, /2000\.00 USD in 2026-11 versus 1900\.00 USD in 2026-10: \+100\.00 USD \(\+5\.26%\)/)
  assert.match(compare, /largest increase was Dining \(\+80\.00 USD, \+36\.36%\)/)
  assert.match(compare, /largest decrease was Subscriptions \(-20\.00 USD, -25\.00%\) and Transport/)
  assert.match(compare, /Housing was unchanged/)
  const advice = deterministicAnswer(factsFor(housing, 'What should I do to improve my spending habits?'))
  assert.match(advice, /Housing is 91\.33% of your imported outflows \(2800\.00 USD\) and is usually an essential cost; everything else together is 265\.75 USD \(8\.67%\)\. Trimming the smaller categories will have a limited effect/)
  assert.doesNotMatch(advice, /\*\*Housing\*\*|\*\*Utilities\*\*/)
  const balancedAdvice = deterministicAnswer(factsFor(balanced, 'What should I do to improve my spending habits?'))
  assert.doesNotMatch(balancedAdvice, /limited effect/, '38.46% outside Housing is not a limited remainder')
})

test('validator accepts genuinely useful real-model answers', () => {
  const where = 'Most of your money went to Housing, which is 2800.00 USD, accounting for 91.33% of your total imported outflows of 3065.75 USD. The remaining 8.67% of your spending, totaling 265.75 USD, is spread across seven minor categories, led by Groceries at 86.42 USD.'
  assert.deepEqual(assessAnswer(where, factsFor(housing, 'Where did most of my money go?'), 'Where did most of my money go?'), [])
  const q = 'Compare the latest two months of spending.'
  const compare = 'Total imported outflows were higher in 2026-11 (2000.00 USD) than in 2026-10 (1900.00 USD), a +100.00 USD (+5.26%) increase. The largest increase was in Dining, where outflows rose from 220.00 USD to 300.00 USD. Subscriptions and Transport each fell by 20.00 USD, while Housing remained unchanged.'
  assert.deepEqual(assessAnswer(compare, factsFor(balanced, q), q), [])
  const advice = 'Housing is your largest cost at 2800.00 USD (91.33%), and it is usually essential, so it is not a reduction target. Everything else is small: Groceries (2.82%), Utilities and Transport. Planning meals with a shopping list may help a little, but the effect is limited.'
  assert.deepEqual(assessAnswer(advice, factsFor(housing, 'How can I reduce my spending?'), 'How can I reduce my spending?'), [])
  const protectedQ = 'How can I save more money without changing my housing costs?'
  const kept = 'Since Housing is considered an essential cost, it is not recommended to reduce it. You could plan Dining and Groceries more carefully, and label Uncategorized transactions to see where that money went.'
  assert.deepEqual(assessAnswer(kept, factsFor(balanced, protectedQ), protectedQ), [])
  // Real Qwen3 phrasings that were false positives during evaluation.
  for (const [text, facts, question] of [
    ['You can save more money without changing your housing costs by reviewing Dining, Groceries and Subscriptions.', factsFor(balanced, protectedQ), protectedQ],
    ['The flexible categories worth reviewing are Uncategorized (320.00 USD, 8.21%, moderate), Dining (520.00 USD, 13.33%, moderate) and Subscriptions (140.00 USD, 3.59%, minor). Housing stays as it is.', factsFor(balanced, protectedQ), protectedQ],
    ['You spent 520.00 USD on Dining. Dining is a moderate category, and its share of total outflows is relatively small compared to other categories like Housing.', factsFor(balanced, 'How much did I spend on dining?'), 'How much did I spend on dining?'],
    ['Housing is 91.33% of your outflows and is usually fixed. Groceries and Transport are small, so changes there would have a limited effect since minor categories make up less than 5.00% of your total spending each.', factsFor(housing, 'How can I reduce my spending?'), 'How can I reduce my spending?'],
    ['The total imported outflows were higher in 2026-11 (2000.00 USD) than in 2026-10 (1900.00 USD), increasing by 100.00 USD or 5.26%. Dining was the largest increase, rising by 80.00 USD or 36.36%. Subscriptions and Transport saw the largest decreases, dropping by 20.00 USD or 25.00% each. Housing remained unchanged. The largest increase was in Dining, while the largest decrease was in Subscriptions and Transport.', factsFor(balanced, 'Compare the latest two months of spending.'), 'Compare the latest two months of spending.'],
    ['Start with Uncategorized (320.00 USD, 8.21%).\n- **Label Transactions First**: Label the Uncategorized transactions.\n- **Subscriptions**: Check whether each labeled service is still used.', factsFor(balanced, 'Suggest how to identify potentially unnecessary services without assuming every subscription is active.'), 'Suggest how to identify potentially unnecessary services without assuming every subscription is active.'],
  ] as const) assert.deepEqual(assessAnswer(text, facts, question), [], text)
})

test('validator rejects fabricated, misattributed or misleading answers', () => {
  const where = factsFor(housing, 'Where did most of my money go?')
  const reject = (text: string, facts: ReturnType<typeof factsFor>, question: string, reason: string) => assert.ok(assessAnswer(text, facts, question).includes(reason as never), `${reason}: ${text} -> ${assessAnswer(text, facts, question)}`)
  reject('Most of your money went to Housing at 2,900.00 USD.', where, 'Where did most of my money go?', 'ungrounded_number')
  reject('Most of your money went to Housing, about 94%.', where, 'Where did most of my money go?', 'ungrounded_number')
  reject('Groceries is your largest category.', where, 'Where did most of my money go?', 'ranking_claim')
  reject('Most of your money went to Housing. Groceries accounted for 2.03% of outflows.', where, 'Where did most of my money go?', 'misattributed_figure')
  reject('Most of your money went to Housing, and you spent a lot on Entertainment.', where, 'Where did most of my money go?', 'unknown_category')
  reject('Most of your money went to Housing, so your income is too low.', where, 'Where did most of my money go?', 'unsupported_financial_claim')
  reject('Most of your money went to Housing in December 2026.', where, 'Where did most of my money go?', 'date_claim')
  reject('Your money went to many places.', where, 'Where did most of my money go?', 'missing_grounding')
  const reduce = factsFor(housing, 'How can I reduce my spending?')
  reject('Groceries is 2.82% of your spending, so cutting it could have a significant impact.', reduce, 'How can I reduce my spending?', 'ranking_claim')
  reject('Use a shopping list for Groceries and combine trips for Transport.', reduce, 'How can I reduce my spending?', 'missing_grounding')
  reject('Housing is the largest cost. Consider cheaper alternatives for Housing.', reduce, 'How can I reduce my spending?', 'constraint_violation')
  reject('- **Housing**: Look into a less expensive rental.\n- **Groceries**: Plan meals.', reduce, 'How can I reduce my spending?', 'constraint_violation')
  reject('Housing dominates. Follow the keyPoints and suggestionOptions.', reduce, 'How can I reduce my spending?', 'meta_reference')
  reject('Housing is 91.33% and should not be changed unless the question specifically asks about it.', reduce, 'How can I reduce my spending?', 'meta_reference')
  reject('Housing is the dominant category at 91.33%, so optimizing this area could have the most impact.', reduce, 'How can I reduce my spending?', 'constraint_violation')
  const habits = factsFor(balanced, 'What should I do to improve my spending habits?')
  reject('Housing is your largest cost. For minor categories like Uncategorized, review the labels.', habits, 'What should I do to improve my spending habits?', 'ranking_claim')
  reject('Housing is your largest cost. For moderate categories like Dining, Groceries and Subscriptions, plan ahead.', habits, 'What should I do to improve my spending habits?', 'ranking_claim')
  assert.deepEqual(assessAnswer('Housing is your largest cost at 61.54%. For moderate categories like Dining and Groceries, plan meals; for minor ones like Subscriptions, check each service.', habits, 'What should I do to improve my spending habits?'), [])
  reject('Housing is your largest expense. Consider reviewing it to find savings.', habits, 'What should I do to improve my spending habits?', 'constraint_violation')
  reject('The most significant category to focus on is Subscriptions.', habits, 'What should I do to improve my spending habits?', 'ranking_claim')
  reject('Housing is the main cost, so changes elsewhere have a limited effect.', habits, 'What should I do to improve my spending habits?', 'ranking_claim')
  reject('Housing is your largest cost. To improve, focus on housing as it drives the total.', reduce, 'How can I reduce my spending?', 'constraint_violation')
  reject('Housing is 61.54%. Other major categories include Dining (13.33%).', habits, 'What should I do to improve my spending habits?', 'ranking_claim')
  reject('How much did you spend on dining? You spent 520.00 USD on Dining.', factsFor(balanced, 'How much did I spend on dining?'), 'How much did I spend on dining?', 'meta_reference')
  const latestQ = 'Compare the latest two months of spending.', latest = factsFor(balanced, latestQ)
  reject('Dining rose by 80.00 USD because Dining is an essential cost.', latest, latestQ, 'ranking_claim')
  reject('Dining is the dominant category, up 80.00 USD.', latest, latestQ, 'ranking_claim')
  reject('Outflows rose by 100.00 USD, so Dining became a larger share of spending.', latest, latestQ, 'ranking_claim')
  const q = 'Compare the latest two months of spending.'
  const compare = factsFor(balanced, q)
  reject('Outflows rose by 100.00 USD. Dining fell by 80.00 USD.', compare, q, 'direction_claim')
  reject('Outflows rose by 100.00 USD. Uncategorized increased by 40.00 USD, representing 28.57% of total outflows.', compare, q, 'misattributed_figure')
  reject('Outflows rose by 100.00 USD. The largest increase was Groceries.', compare, q, 'ranking_claim')
  reject('Spending rose by 100.00 USD, so you will save money next month.', compare, q, 'unsupported_financial_claim')
  const protectedQ = 'How can I save more money without changing my housing costs?'
  reject('Reduce your rent and plan Dining.', factsFor(balanced, protectedQ), protectedQ, 'constraint_violation')
})

for (const [question, answer] of [
  ['Where did most of my money go?', 'Most of your money went to Housing: 2400.00 USD, or 61.54% of 3900.00 USD in imported outflows. Dining (13.33%) and Groceries (9.74%) were next.'],
  ['Compare the latest two months of spending.', 'Imported outflows were 100.00 USD higher in 2026-11 (2000.00 USD) than in 2026-10 (1900.00 USD). Dining rose the most, by 80.00 USD.'],
] as const) {
  test(`the exact question now gets a direct model answer: ${question}`, async (t) => {
    const bodies = model(t, [answer])
    const report = await askAdvisorReport(question, balanced, undefined, options)
    assert.equal(bodies.length, 1)
    assert.equal(report.explanationStatus, 'checked')
    assert.equal(report.answerSource, 'ai')
    assert.equal(report.answer, answer)
    // The prompt carries verified facts and the question; never raw descriptions or cents.
    assert.match(bodies[0].user, /Verified facts JSON/)
    assert.match(bodies[0].user, /61\.54%|\+100\.00 USD/)
    assert.doesNotMatch(bodies[0].user, /SYNTHETIC EVALUATION|outflowCents/)
    assert.ok(bodies[0].user.endsWith('/no_think'))
    // The answer is primary; verified figures remain available underneath.
    const html = renderToStaticMarkup(createElement(AdvisorResponse, { report }))
    assert.ok(html.indexOf(answer.slice(0, 30)) < html.indexOf('Verified financial figures'))
    assert.match(html, /AI-generated by the local model/)
    const copied = reportToPlainText(report)
    assert.ok(copied.startsWith(`Answer\n${answer}`))
    assert.match(copied, /Verified financial figures/)
  })
}

test('two rejected answers fall back to a useful deterministic answer with feedback in the retry', async (t) => {
  const bodies = model(t, ['Groceries is your biggest expense at 999.00 USD.', 'Your income covers this.'])
  const report = await askAdvisorReport('Where did most of my money go?', housing, undefined, options)
  assert.equal(bodies.length, 2)
  assert.match(bodies[1].system, /previous answer was rejected because/)
  assert.equal(report.explanationStatus, 'withheld')
  assert.equal(report.answerSource, 'app')
  assert.match(report.answer, /^Most of your imported outflows went to Housing: 2800\.00 USD, 91\.33% of 3065\.75 USD/)
  assert.doesNotMatch(report.answer, /999|income/)
  assert.deepEqual(report.explanationAttempts?.map((a) => a.reasons.includes('ungrounded_number') || a.reasons.includes('unsupported_financial_claim')), [true, true])
})

test('an unavailable model still answers the question deterministically', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = (async () => { throw Error('offline') }) as typeof fetch
  const report = await askAdvisorReport('Compare the latest two months of spending.', balanced, undefined, options)
  assert.equal(report.explanationStatus, 'unavailable')
  assert.match(report.unavailableReason!, /Cannot connect/)
  assert.match(report.answer, /\+100\.00 USD \(\+5\.26%\)/)
  assert.match(renderToStaticMarkup(createElement(AdvisorResponse, { report })), /Calculated by Receipt\.AI\. Local AI unavailable/)
})

test('category lists are never hidden behind a second collapsed level (empty-list regression)', async (t) => {
  model(t, ['Most of your money went to Housing: 2800.00 USD, 91.33% of 3065.75 USD in imported outflows.'])
  const report = await askAdvisorReport('Where did most of my money go?', housing, undefined, options)
  assert.equal(report.explanationStatus, 'checked')
  const html = renderToStaticMarkup(createElement(AdvisorResponse, { report }))
  assert.equal((html.match(/<details>/g) ?? []).length, 1)
  assert.doesNotMatch(html, /<li>\s*<\/li>/)
  assert.equal((html.match(/<li>/g) ?? []).length, 8)
  assert.match(html, /<li>Housing: 2800\.00 USD \(91\.33% of outflows\)<\/li>/)
  assert.match(html, /<li>Fees: 2\.50 USD \(0\.08% of outflows\)<\/li>/)
  const copied = reportToPlainText(report)
  assert.match(copied, /Category outflows \(labels unverified\):\n- Housing: 2800\.00 USD \(91\.33% of outflows\)\n- Groceries: 86\.42 USD \(2\.82% of outflows\)/)
  assert.doesNotMatch(copied, /^-\s*$/m)
})

test('missing months stay unknown and an unavailable comparison is explained', async (t) => {
  const gap = buildAdvisorContext(importStatement(csvFor('gap')).transactions)
  model(t, ['x', 'x'])
  const report = await askAdvisorReport('Compare the latest two months of spending.', gap, undefined, options)
  assert.equal(report.explanationStatus, 'withheld')
  assert.match(report.answer, /No imported records were found for 2026-10, so that month cannot be compared; missing records do not mean zero spending/)
  assert.doesNotMatch(report.answer, /0\.00 USD in 2026-10/)
})

test('balance and missing-data questions answer directly without inference', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = (async () => { assert.fail('No inference expected') }) as typeof fetch
  const balance = await askAdvisorReport('What is my current bank balance?', balanced, undefined, options)
  assert.match(balance.answer, /verified opening balance/)
  const missing = await askAdvisorReport('How much did I spend in January 2027?', balanced, undefined, options)
  assert.match(missing.answer, /Spending is unknown/)
  for (const report of [balance, missing]) assert.equal(report.explanationStatus, 'not_requested')
})

const multi: LedgerTransaction[] = [['USD', -50, 'Dining'], ['USD', -20, 'Groceries'], ['EUR', -70, 'Dining']].map(([currency, amount, category], i) => ({ date: '2026-11-0' + (i + 1), posted_date: '', description: 'Synthetic', amount: Number(amount), currency: String(currency), direction: 'outflow', category: String(category), category_source: 'manual', account: '', source_bank: '', external_id: String(i) }))
test('currencies are answered separately and never combined', () => {
  const context = buildAdvisorContext(multi)
  const answer = deterministicAnswer(factsFor(context, 'Where did most of my money go?'))
  assert.match(answer, /EUR: Most of your imported outflows went to Dining: 70\.00 EUR, 100\.00% of 70\.00 EUR/)
  assert.match(answer, /USD: Most of your imported outflows went to Dining: 50\.00 USD, 71\.43% of 70\.00 USD/)
  assert.doesNotMatch(answer, /140\.00|120\.00/)
})
