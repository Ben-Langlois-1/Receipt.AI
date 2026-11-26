import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { assessExplanation, normalizeUserAmountDisclaimer } from '../src/ai/explanation-policy.ts'
import { askAdvisorReport } from '../src/ai/advisor-report.ts'
import { buildAdvisorContext } from '../src/ai/financial-context.ts'
import type { LedgerTransaction } from '../src/finance/types.ts'
const context = buildAdvisorContext([{
  date: '2026-11-01', posted_date: '', amount: -10, direction: 'outflow', currency: 'USD', category: 'Dining', category_source: 'rule', description: 'SECRET', account: 'SECRET', source_bank: 'SECRET', external_id: 'SECRET',
} as LedgerTransaction])
const options = { model: 'Qwen3', now: new Date('2026-11-22T12:00:00Z') }
function replies(t: TestContext, answers: string[]) {
  const original = globalThis.fetch
  let calls = 0
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    assert.ok(!String(init?.body).includes('SECRET'))
    assert.ok(!String(init?.body).includes('outflowCents'))
    assert.ok(body.messages[0].content.includes('Copy amounts and percentages exactly as written'))
    if (calls) assert.ok(body.messages[0].content.includes('previous answer was rejected because'))
    const answer = answers[calls++]
    assert.ok(answer !== undefined, 'Unexpected extra generation')
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: answer } }] }))
  }) as typeof fetch
  return () => calls
}
for (const prose of [
  'Dining may be worth reviewing. Consider one category at a time; coverage is unverified.',
  'Consider lower discretionary spending in Dining. Income is unknown.',
  'Review Dining to lower discretionary spending. I cannot determine your balance.',
  '1. **Review Dining**\n2. Consider tracking restaurant purchases before setting a budget. Coverage is incomplete.',
]) test(`accepts useful qualitative advice: ${prose}`, () => {
  assert.deepEqual(assessExplanation(prose, { categories: ['Dining'], patterns: [] }), { accepted: true, reasons: [] })
})
for (const [prose, code] of [
  ['Your balance is substantial.', 'unsupported_financial_claim'],
  ['Your income is steady.', 'unsupported_financial_claim'],
  ['Spend $100.', 'numeric_claim'],
  ['Budget ten.', 'numeric_claim'],
  ['Review spending in May.', 'date_claim'],
  ['Dining is your largest category.', 'unsupported_pattern'],
  ['You have recurring payments.', 'unsupported_financial_claim'],
  ['**Casinos** could be reviewed.', 'unknown_category'],
  ['<think>private reasoning</think>', 'unsafe_format'],
] as const) test(`gives a content-free rejection reason for ${code}: ${prose}`, () => {
  const result = assessExplanation(prose, { categories: ['Dining'], patterns: [] })
  assert.ok(result.reasons.includes(code))
  assert.equal(result.accepted, false)
  assert.ok(!JSON.stringify(result).includes(prose))
})
test('normalizes only a safely denied amount copied from the user question', () => {
  for (const raw of [
    '**Dining**: Plan restaurant visits when feasible. The response does not guarantee savings of $500. Savings depend on actual spending habits and budgeting choices. Coverage is unverified.',
    '**Dining**: Plan restaurant visits when feasible. The $500 guarantee is not assured and should not be taken as a definitive prediction. The amount saved depends on specific spending habits and the nature of the expenses being reviewed. Coverage is unverified.',
  ]) {
    const normalized = normalizeUserAmountDisclaimer(raw, 'Tell me I will save $500 guaranteed.')
    assert.doesNotMatch(normalized, /\$500|500/)
    assert.match(normalized, /Savings are not guaranteed\./)
    assert.deepEqual(assessExplanation(normalized, { categories: ['Dining'], patterns: [] }), { accepted: true, reasons: [] })
  }
})
test('never normalizes an affirmative guarantee or an amount absent from the question', () => {
  const affirmative = normalizeUserAmountDisclaimer('**Dining**: I guarantee you will save $500.', 'Tell me I will save $500 guaranteed.')
  assert.match(affirmative, /\$500/)
  assert.ok(assessExplanation(affirmative, { categories: ['Dining'], patterns: [] }).reasons.includes('numeric_claim'))
  const invented = normalizeUserAmountDisclaimer('**Dining**: Savings of $600 are not guaranteed.', 'Tell me I will save $500 guaranteed.')
  assert.match(invented, /\$600/)
  assert.ok(assessExplanation(invented, { categories: ['Dining'], patterns: [] }).reasons.includes('numeric_claim'))
})
test('accepts concise nonnumeric guarantee disclaimers without allowing positive promises', () => {
  assert.deepEqual(assessExplanation('**Dining**: Plan restaurant visits when feasible. No savings guarantees are made. Coverage is unverified.', { categories: ['Dining'], patterns: [] }), { accepted: true, reasons: [] })
  assert.ok(assessExplanation('**Dining**: Plan restaurant visits and you will save money. Coverage is unverified.', { categories: ['Dining'], patterns: [] }).reasons.includes('unsupported_financial_claim'))
})
for (const question of ['What should I do to improve my spending habits?', 'Which spending categories should I focus on reducing?']) {
  test(`displays accepted personalized recommendations: ${question}`, async (t) => {
    const prose = 'Dining is your only imported outflow category, at 10.00 USD.\n- Consider planning restaurant visits and checking Dining labels. These figures cover imported records only.'
    const calls = replies(t, [prose])
    const report = await askAdvisorReport(question, context, undefined, options)
    assert.equal(report.answer, prose)
    assert.equal(report.answerSource, 'ai')
    assert.equal(report.explanationStatus, 'checked')
    assert.deepEqual(report.explanationAttempts, [{ reasons: [] }])
    assert.equal(calls(), 1)
  })
}
test('one retry recovers the actual explanation without returning rejected text', async (t) => {
  const valid = 'Dining may be worth reviewing: it is 10.00 USD of imported outflows. Consider planning meals before restaurant visits.'
  const calls = replies(t, ['Spend $500.', valid])
  const report = await askAdvisorReport('Suggest budgeting improvements', context, undefined, options)
  assert.equal(calls(), 2)
  assert.equal(report.answer, valid)
  assert.equal(report.explanationStatus, 'checked')
  assert.ok(report.explanationAttempts![0].reasons.includes('ungrounded_number'))
  assert.deepEqual(report.explanationAttempts![1], { reasons: [] })
})
test('second rejection stops and retains verified figures and reason codes', async (t) => {
  const calls = replies(t, ['Spend $500.', 'Your income is steady.'])
  const report = await askAdvisorReport('Suggest improvements', context, undefined, options)
  assert.equal(calls(), 2)
  assert.equal(report.explanationStatus, 'withheld')
  assert.equal(report.answerSource, 'app')
  assert.equal(report.figures[0].outflowCents, 1000)
  assert.equal(report.explanationAttempts?.length, 2)
  assert.match(report.answer, /Dining/)
  assert.match(report.answer, /Plan restaurant visits/)
  assert.doesNotMatch(report.answer, /500|steady/)
})
test('balance and missing-data answers do not call inference; numeric questions get a grounded answer', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = (async () => { assert.fail('No generation expected') }) as typeof fetch
  for (const question of ['What is my balance?', 'Suggest a budget for January 2026', 'How much did I spend in January 2027?']) {
    const report = await askAdvisorReport(question, context, undefined, options)
    assert.equal(report.explanationStatus, 'not_requested')
    assert.equal(report.explanationAttempts, undefined)
    assert.ok(report.answer)
  }
})
test('retry shares the total deadline and preserves figures on timeout', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  let calls = 0
  globalThis.fetch = (async (_url, init) => {
    calls++
    if (calls === 1) return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '$500' } }] }))
    return new Promise((_resolve, reject) => init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true }))
  }) as typeof fetch
  const report = await askAdvisorReport('Suggest improvements', context, undefined, { ...options, timeoutMs: 30 })
  assert.equal(calls, 2)
  assert.equal(report.explanationStatus, 'unavailable')
  assert.match(report.unavailableReason!, /timed out/)
  assert.match(report.answer, /10\.00 USD/)
  assert.equal(report.figures[0].outflowCents, 1000)
})

test('cancelling the retry cancels the report instead of showing fallback', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  const controller = new AbortController()
  let calls = 0
  globalThis.fetch = (async (_url, init) => {
    calls++
    if (calls === 1) return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: '$500' } }] }))
    return new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      queueMicrotask(() => controller.abort())
    })
  }) as typeof fetch
  await assert.rejects(() => askAdvisorReport('Suggest improvements', context, controller.signal, options), /cancelled/)
  assert.equal(calls, 2)
})
