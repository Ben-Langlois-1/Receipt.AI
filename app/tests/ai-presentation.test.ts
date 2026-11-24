import test, { type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdvisorMarkdown, AdvisorResponse } from '../src/ai/advisor-presentation.ts'
import { askAdvisorReport, screenExplanation } from '../src/ai/advisor-report.ts'
import { buildAdvisorContext } from '../src/ai/financial-context.ts'
import type { LedgerTransaction } from '../src/finance/types.ts'
const row = (date: string, amount: number, currency = 'USD'): LedgerTransaction => ({ date, amount, currency, direction: amount < 0 ? 'outflow' : 'inflow', posted_date: '', category: 'Dining', category_source: 'rule', description: 'SECRET', account: 'SECRET', source_bank: 'SECRET', external_id: 'SECRET' })
const context = buildAdvisorContext([row('2026-10-01', -10), row('2026-11-01', -15), row('2026-11-02', 30)])
const options = { model: 'Qwen3', now: new Date('2026-11-22T12:00:00Z') }
function mock(t: TestContext, content: string, finish = 'stop') {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body))
    assert.ok(body.messages[0].content.includes('Presentation mode'))
    assert.ok(body.messages[0].content.includes('conditional, qualitative budgeting'))
    assert.ok(!String(init?.body).includes('SECRET'))
    assert.ok(body.messages[1].content.endsWith('/no_think'))
    return new Response(JSON.stringify({ choices: [{ finish_reason: finish, message: { content } }] }))
  }) as typeof fetch
}
test('safe Markdown uses semantic elements and never executes HTML or links', () => {
  const html = renderToStaticMarkup(createElement(AdvisorMarkdown, { text: '# Options\n- **Review** Dining\n- Try *tracking* `categories`\n\n1. Check labels\n\n<script>alert(1)</script>\n[open](javascript:alert(1))' }))
  assert.match(html, /<h4>Options<\/h4>/)
  assert.match(html, /<ul><li><strong>Review<\/strong>/)
  assert.match(html, /<em>tracking<\/em>/)
  assert.match(html, /<code>categories<\/code>/)
  assert.match(html, /<ol><li>Check labels/)
  assert.ok(!html.includes('<script>'))
  assert.ok(!html.includes('<a '))
})
test('monthly recommendations use local model while verified figures stay independent', async (t) => {
  mock(t, '**Review Dining**\n- Consider tracking discretionary purchases before choosing a budget.\n- Check category labels first.')
  const report = await askAdvisorReport('Suggest a budget for November 2026', context, undefined, options)
  assert.equal(report.explanationStatus, 'checked')
  assert.equal(report.figures[0].outflowCents, 1500)
  assert.equal(report.figures[0].inflowCents, 3000)
  assert.equal(report.figures[0].netFlowCents, 1500)
  const html = renderToStaticMarkup(createElement(AdvisorResponse, { report }))
  assert.match(html, /Verified financial figures/)
  assert.match(html, /2026-11-01 inclusive to 2026-12-01 exclusive/)
  assert.match(html, /Coverage: unverified/)
  assert.match(html, /Outflows<\/dt><dd>15.00 USD/)
  assert.match(html, /Inflows<\/dt><dd>30.00 USD/)
  assert.match(html, /AI-generated/)
  assert.match(html, /<strong>Review Dining<\/strong>/)
})
for (const prose of ['Spend $999.', 'Your balance is healthy.', 'Your income is steady.', 'You can afford a purchase.', 'Dining rose last month.', 'November was expensive.', 'You will save money.', 'I updated your budget.', 'You have a subscription.', 'Set aside fifty dollars.', 'Dining increased by 50%.']) {
  test(`withholds unsupported claim: ${prose}`, async (t) => {
    mock(t, prose)
    const report = await askAdvisorReport('Explain my spending', context, undefined, options)
    assert.equal(report.explanationStatus, 'withheld')
    assert.ok(!report.explanation.includes(prose))
    assert.equal(report.figures[0].outflowCents, 2500)
  })
}
test('missing periods and balance questions need no model and never display zeros as known spending', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = (async () => { assert.fail('No inference expected') }) as typeof fetch
  const report = await askAdvisorReport('January 2026', context, undefined, options)
  assert.equal(report.figures[0].outflowCents, null)
  assert.equal(report.explanationStatus, 'not_requested')
  const html = renderToStaticMarkup(createElement(AdvisorResponse, { report }))
  assert.match(html, /Outflows<\/dt><dd>Unknown/)
  assert.doesNotMatch(html, /0.00 USD/)
  assert.match((await askAdvisorReport('What is my balance?', context)).notice, /verified opening balance/)
  assert.match((await askAdvisorReport('January', context)).notice, /year/)
  assert.equal((await askAdvisorReport('Explain', buildAdvisorContext([]))).figures.length, 0)
})
test('bad completion retains verified figures and indicates explanation failure', async (t) => {
  mock(t, 'incomplete', 'length')
  const report = await askAdvisorReport('Explain November 2026', context, undefined, options)
  assert.equal(report.explanationStatus, 'unavailable')
  assert.match(report.explanation, /truncated/)
  assert.equal(report.figures[0].outflowCents, 1500)
})
test('comparison panel preserves scope and currency separation', async (t) => {
  mock(t, 'Consider reviewing category labels.')
  const mixed = buildAdvisorContext([row('2026-10-01', -10), row('2026-11-01', -15), row('2026-11-01', -20, 'EUR')])
  const report = await askAdvisorReport('Compare October and November 2026', mixed, undefined, options)
  assert.equal(report.comparisons.length, 1)
  assert.equal(report.comparisons[0].differenceCents, 500)
  assert.equal(report.figures.find((r) => r.currency === 'EUR' && r.period === '2026-10')?.outflowCents, null)
  const html = renderToStaticMarkup(createElement(AdvisorResponse, { report }))
  assert.match(html, /not a complete spending comparison/)
})
test('all-time figures display both date bounds and cancellation is preserved', async (t) => {
  mock(t, 'Consider reviewing category labels.')
  const report = await askAdvisorReport('Explain', context, undefined, options)
  const html = renderToStaticMarkup(createElement(AdvisorResponse, { report }))
  assert.match(html, /2026-10-01 through 2026-11-02 inclusive/)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(() => askAdvisorReport('Explain', context, controller.signal), /cancelled/)
  assert.equal(screenExplanation('1. **Review** category labels.'), true)
})

test('future-dated imported records are prominent and remain explicitly scoped', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = (async () => { assert.fail('No inference expected') }) as typeof fetch
  const future = buildAdvisorContext([row('2026-11-20', -10), row('2026-12-01', -15), row('2026-12-23', -20)])
  const report = await askAdvisorReport('How much did I spend?', future, undefined, options)
  assert.deepEqual(report.futureDatedRecords, { transactions: 2, earliest: '2026-12-01', latest: '2026-12-23' })
  assert.match(report.notice, /Future-dated import warning/)
  assert.match(report.notice, /remain included/)
  const html = renderToStaticMarkup(createElement(AdvisorResponse, { report }))
  assert.match(html, /role="alert"/)
  assert.match(html, /occur after 2026-11-22/)
})
