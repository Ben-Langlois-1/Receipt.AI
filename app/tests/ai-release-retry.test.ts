import test from 'node:test'
import assert from 'node:assert/strict'
import { askAdvisorReport } from '../src/ai/advisor-report.ts'
import { buildAdvisorContext } from '../src/ai/financial-context.ts'
const context = buildAdvisorContext([{ date: '2026-11-01', posted_date: '', description: 'Synthetic', amount: -10, currency: 'USD', direction: 'outflow', category: 'Dining', category_source: 'rule', account: '', source_bank: '', external_id: 'synthetic' }])
const options = { model: 'Qwen3', now: new Date('2026-11-23T12:00:00Z') }
for (const recovers of [true, false]) test(`truncated completions use only the existing bounded retry; recovery=${recovers}`, async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  let calls = 0
  globalThis.fetch = (async (_url, init) => {
    const body = JSON.parse(String(init?.body)); calls++
    assert.match(body.messages[0].content, /requiredOutputLines/)
    if (calls === 2) assert.match(body.messages[0].content, /Retry:/)
    assert.ok(calls <= 2)
    return new Response(JSON.stringify({ choices: [{ finish_reason: recovers && calls === 2 ? 'stop' : 'length', message: { content: recovers && calls === 2 ? 'Dining: consider planning restaurant visits. Coverage is unverified.' : 'UNSAFE INCOMPLETE $999' } }] }))
  }) as typeof fetch
  const report = await askAdvisorReport('Suggest spending improvements', context, undefined, options)
  assert.equal(calls, 2)
  assert.equal(report.figures[0].outflowCents, 1000)
  assert.doesNotMatch(report.explanation, /UNSAFE|999/)
  assert.equal(report.explanationStatus, recovers ? 'checked' : 'unavailable')
  assert.deepEqual(report.explanationAttempts, [{ reasons: ['truncated_response'] }, { reasons: recovers ? [] : ['truncated_response'] }])
})
test('ordinary transport failures do not trigger a retry', async t => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  let calls = 0
  globalThis.fetch = (async () => { calls++; throw Error('offline') }) as typeof fetch
  const report = await askAdvisorReport('Suggest spending improvements', context, undefined, options)
  assert.equal(calls, 1)
  assert.equal(report.explanationStatus, 'unavailable')
  assert.equal(report.figures[0].outflowCents, 1000)
})
