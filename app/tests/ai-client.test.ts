import test from 'node:test'
import assert from 'node:assert/strict'
import { askLocalAdvisor, getLocalModel, LOCAL_AI_BASE_URL } from '../src/ai/local-advisor.ts'
import { buildAdvisorContext } from '../src/ai/financial-context.ts'
import type { LedgerTransaction } from '../src/finance/types.ts'

const data: LedgerTransaction[] = [{
  date: '2026-11-01', posted_date: '2026-11-01', description: 'private transaction', amount: -10,
  currency: 'USD', direction: 'outflow', category: 'Dining', category_source: 'rule',
  account: 'private account', source_bank: 'private bank', external_id: 'private id',
}]

test('detects local model and sends summaries but not raw records', async (t) => {
  const calls: Array<{ url: string; body?: string }> = []
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), body: init?.body as string | undefined })
    if (String(input).endsWith('/v1/models')) {
      return new Response(JSON.stringify({ data: [{ id: 'test-local-model' }] }), { status: 200 })
    }
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'Dining was $10.' } }] }), { status: 200 })
  }) as typeof fetch

  assert.equal(await getLocalModel(), 'test-local-model')
  assert.equal(await askLocalAdvisor('Where did my money go?', buildAdvisorContext(data)), 'Dining was $10.')
  assert.equal(calls[1].url, `${LOCAL_AI_BASE_URL}/v1/models`)
  assert.equal(calls[2].url, `${LOCAL_AI_BASE_URL}/v1/chat/completions`)
  assert.ok(calls[2].body?.includes('Dining'))
  assert.ok(!calls[2].body?.includes('private account'))
  assert.ok(!calls[2].body?.includes('private transaction'))
})

test('refuses requests when no financial data is present', async () => {
  await assert.rejects(() => askLocalAdvisor('How much did I spend?', buildAdvisorContext([])), /Import transactions/)
})

test('sends deterministic query facts without legacy income labels', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = (async (_input, init) => {
    const body = JSON.parse(init!.body as string)
    const prompt = body.messages[1].content as string
    assert.ok(prompt.includes('"outflowAmount":"10.00"'))
    assert.ok(prompt.includes('"verifiedIncomeCents":null'))
    assert.ok(!prompt.includes('"income":'))
    assert.ok(prompt.includes('Coverage is unknown'))
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'Imported records only; coverage is unknown.' } }] }))
  }) as typeof fetch
  await askLocalAdvisor('Explain my imported records', buildAdvisorContext(data), undefined, { model: 'Qwen3', now: new Date('2026-11-22T12:00:00Z') })
})
test('unsupported dates and absent periods are answered locally', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = (async () => { assert.fail('No model call expected') }) as typeof fetch
  const options = { now: new Date('2027-01-22T12:00:00Z') }
  assert.match(await askLocalAdvisor('this month', buildAdvisorContext(data), undefined, options), /Spending is unknown/)
  assert.match(await askLocalAdvisor('last 30 days', buildAdvisorContext(data), undefined, options), /calendar-month/)
})
