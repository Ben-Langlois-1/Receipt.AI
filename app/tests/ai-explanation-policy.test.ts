import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { assessExplanation } from '../src/ai/explanation-policy.ts'
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
    assert.ok(body.messages[0].content.includes('words such as "may"'))
    if (calls) assert.ok(body.messages[0].content.includes('Retry:'))
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
for (const question of ['What should I do to improve my spending habits?', 'Which spending categories should I focus on reducing?']) {
  test(`displays accepted personalized recommendations: ${question}`, async (t) => {
    const prose = 'Dining is a leading outflow category in the selected imported records (USD).\n- Consider planning restaurant visits and reviewing Dining labels. Coverage is unverified.'
    const calls = replies(t, [prose])
    const report = await askAdvisorReport(question, context, undefined, options)
    assert.equal(report.explanation, prose)
    assert.equal(report.explanationStatus, 'checked')
    assert.deepEqual(report.explanationAttempts, [{ reasons: [] }])
    assert.equal(calls(), 1)
  })
}
test('one retry recovers the actual explanation without returning rejected text', async (t) => {
  const valid = 'Dining may be worth reviewing. Consider planning meals before restaurant visits. Coverage is unverified.'
  const calls = replies(t, ['Spend $500.', valid])
  const report = await askAdvisorReport('Suggest budgeting improvements', context, undefined, options)
  assert.equal(calls(), 2)
  assert.equal(report.explanation, valid)
  assert.equal(report.explanationStatus, 'checked')
  assert.deepEqual(report.explanationAttempts, [{ reasons: ['numeric_claim', 'missing_grounding'] }, { reasons: [] }])
})
test('second rejection stops and retains verified figures and reason codes', async (t) => {
  const calls = replies(t, ['Spend $500.', 'Your income is steady.'])
  const report = await askAdvisorReport('Suggest improvements', context, undefined, options)
  assert.equal(calls(), 2)
  assert.equal(report.explanationStatus, 'withheld')
  assert.equal(report.figures[0].outflowCents, 1000)
  assert.equal(report.explanationAttempts?.length, 2)
  assert.match(report.explanation, /Dining/)
  assert.doesNotMatch(report.explanation, /500|steady/)
})
test('numeric, balance and missing-data answers do not call inference', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = (async () => { assert.fail('No generation expected') }) as typeof fetch
  for (const question of ['How much did I spend in November 2026?', 'Compare October and November 2026', 'What is my balance?', 'Suggest a budget for January 2026']) {
    const report = await askAdvisorReport(question, context, undefined, options)
    assert.equal(report.explanationStatus, 'not_requested')
    assert.equal(report.explanationAttempts, undefined)
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
  assert.match(report.explanation, /timed out/)
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
