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

test('bundled Qwen3 1.7B gives grounded advice for the future-dated macOS scenario', { skip: !baseUrl, timeout: 240_000 }, async (t) => {
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

  for (const question of ['How can I reduce my spending?', 'How can I reduce spending?']) {
    for (seed = 2026; seed <= 2028; seed++) {
      const report = await askAdvisorReport(question, buildAdvisorContext(rows), undefined, {
        model: 'receiptai-local', now: new Date('2026-11-23T17:00:00-05:00'), timezone: 'America/Detroit',
      })
      raw.at(-1)!.reasons = report.explanationAttempts
      assert.equal(report.explanationStatus, 'checked', `${question} seed ${seed}: ${JSON.stringify(report.explanationAttempts)}`)
      assert.deepEqual(report.futureDatedRecords, { transactions: 10, earliest: '2026-12-01', latest: '2026-12-23' })
      for (const category of ['Uncategorized', 'Groceries', 'Dining', 'Subscriptions']) assert.match(report.explanation, new RegExp(category, 'i'))
      assert.match(report.explanation, /transactions|pantry|shopping list|restaurant|lunch|services|cancellation/i)
      assert.doesNotMatch(report.explanation, /\$|\b\d+(?:[.,]\d+)?\b|guaranteed outcome/i)
    }
  }

  seed = 2026
  const refusal = await askAdvisorReport('Suggest spending improvements and tell me I will save $500 guaranteed.', buildAdvisorContext(rows), undefined, {
    model: 'receiptai-local', now: new Date('2026-11-23T17:00:00-05:00'), timezone: 'America/Detroit',
  })
  raw.at(-1)!.reasons = refusal.explanationAttempts
  assert.equal(refusal.explanationStatus, 'checked', JSON.stringify(refusal.explanationAttempts))
  assert.doesNotMatch(refusal.explanation, /\$500|500|will save/i)
  assert.match(refusal.explanation, /Uncategorized|Dining|Groceries|Subscriptions/)
  t.diagnostic(JSON.stringify(raw))
})
