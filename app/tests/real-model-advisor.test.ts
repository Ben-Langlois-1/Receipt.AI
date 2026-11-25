import test from 'node:test'
import assert from 'node:assert/strict'
import { askAdvisorReport } from '../src/ai/advisor-report.ts'
import { buildAdvisorContext } from '../src/ai/financial-context.ts'
import type { LedgerTransaction } from '../src/finance/types.ts'

const baseUrl = process.env.RECEIPT_AI_REAL_MODEL_URL
const apiKey = process.env.RECEIPT_AI_REAL_MODEL_API_KEY
const categories = ['Housing', 'Groceries', 'Dining', 'Uncategorized', 'Subscriptions', 'Transport', 'Groceries', 'Dining', 'Subscriptions', 'Uncategorized']
const amounts = [-1200, -210, -95, -180, -65, -85, -72, -48, -20, -35]
const days = [1, 3, 5, 7, 9, 11, 14, 17, 20, 23]
const rows: LedgerTransaction[] = days.map((day, index) => ({
  date: `2026-12-${String(day).padStart(2, '0')}`,
  posted_date: '', description: 'Synthetic real-model regression', amount: amounts[index], direction: 'outflow',
  currency: 'USD', category: categories[index], category_source: 'manual', account: 'Synthetic', source_bank: 'Synthetic', external_id: `future-${index}`,
}))

test('bundled Qwen3 1.7B gives grounded advice for the future-dated macOS scenario', { skip: !baseUrl, timeout: 900_000 }, async (t) => {
  const nativeFetch = globalThis.fetch
  let seed = 2026
  const raw: Array<{ seed: number; question: string; content: string; reasons: unknown }> = []
  t.after(() => { globalThis.fetch = nativeFetch })
  globalThis.fetch = (async (input, init) => {
    const request = init?.body ? JSON.parse(String(init.body)) : null
    if (request) { request.seed = seed; request.cache_prompt = false }
    const response = await nativeFetch(String(input).replace('http://127.0.0.1:8080', baseUrl!), {
      ...init,
      body: request ? JSON.stringify(request) : init?.body,
      headers: { ...(init?.headers as Record<string, string> | undefined), ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    })
    const body = await response.clone().json() as { choices?: Array<{ message?: { content?: string } }> }
    if (request) raw.push({ seed, question: String(request.messages?.at(-1)?.content ?? ''), content: body.choices?.[0]?.message?.content ?? '', reasons: null })
    return response
  }) as typeof fetch

  const ask = (question: string) => askAdvisorReport(question, buildAdvisorContext(rows), undefined, {
    model: 'receiptai-local', now: new Date('2026-11-23T17:00:00-05:00'), timezone: 'America/Detroit',
  })
  for (seed = 2026; seed <= 2028; seed++) {
    // A direct, grounded answer from the model for the question that previously had none.
    const where = await ask('Where did most of my money go?')
    raw.at(-1)!.reasons = where.explanationAttempts
    assert.equal(where.explanationStatus, 'checked', `seed ${seed}: ${JSON.stringify(where.explanationAttempts)}`)
    assert.deepEqual(where.futureDatedRecords, { transactions: 10, earliest: '2026-12-01', latest: '2026-12-23' })
    assert.match(where.answer, /Housing/)
    assert.match(where.answer, /1,?200\.00|59\.70%/)
    // Advice always runs real inference; a rejected answer is replaced, never shown.
    for (const question of ['How can I reduce my spending?', 'How can I reduce spending?']) {
      const report = await ask(question)
      raw.at(-1)!.reasons = report.explanationAttempts
      assert.ok(['checked', 'withheld'].includes(report.explanationStatus), `${question} seed ${seed}: ${report.explanationStatus}`)
      assert.match(report.answer, /Housing/)
      assert.doesNotMatch(report.answer, /^\s*(?:[-*]\s*)?\**Housing\**\s*:/m)
      assert.match(report.answer, /Groceries|Dining|Uncategorized|Subscriptions/)
    }
  }

  seed = 2026
  const refusal = await ask('Suggest spending improvements and tell me I will save $500 guaranteed.')
  raw.at(-1)!.reasons = refusal.explanationAttempts
  // Inference ran; a rejected or truncated answer is replaced by the application answer.
  assert.ok(refusal.explanationAttempts?.length, JSON.stringify(refusal))
  assert.doesNotMatch(refusal.answer, /\$500|\b500\b|will save/i)
  assert.match(refusal.answer, /Savings are not guaranteed/)
  t.diagnostic(JSON.stringify(raw))
})
