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

// ---- Complete Chase checking ledger: Housing is 2800.00 USD, 91.33% of 3065.75 USD imported outflows.
test('bundled Qwen3 1.7B describes Housing but never recommends changing it on the complete Chase ledger', { skip: !baseUrl, timeout: 1_800_000 }, async (t) => {
  const { importStatement } = await import('../src/finance/import-statement.ts')
  const { createRequire } = await import('node:module')
  const { csvFor } = createRequire(import.meta.url)('../benchmarks/suite.cjs')
  const chase = buildAdvisorContext(importStatement(csvFor('chaseChecking')).transactions)
  const nativeFetch = globalThis.fetch
  let seed = 2026
  t.after(() => { globalThis.fetch = nativeFetch })
  globalThis.fetch = (async (input, init) => {
    const request = init?.body ? JSON.parse(String(init.body)) : null
    if (request) { request.seed = seed; request.cache_prompt = false }
    return nativeFetch(String(input).replace('http://127.0.0.1:8080', baseUrl!), {
      ...init, body: request ? JSON.stringify(request) : init?.body,
      headers: { ...(init?.headers as Record<string, string> | undefined), ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) },
    })
  }) as typeof fetch
  const ask = (question: string) => askAdvisorReport(question, chase, undefined, { model: 'receiptai-local', now: new Date('2026-11-23T17:00:00-05:00'), timezone: 'America/Detroit' })
  // Every two-decimal figure shown must be a verified figure. The expected set is computed independently
  // from the raw transactions in integer cents: it does not reuse the advisor's own query results.
  const tx = importStatement(csvFor('chaseChecking')).transactions
  const cents = (t: { amount: number }) => Math.round(Math.abs(t.amount) * 100)
  const outflows = tx.filter((t) => t.direction === 'outflow')
  const fmt = (c: number) => (c / 100).toFixed(2)
  const share = (part: number, total: number) => (Number((BigInt(part) * 20000n + BigInt(total)) / (2n * BigInt(total))) / 100).toFixed(2)
  const byCategory = (rows: typeof tx) => { const m = new Map<string, number>(); for (const t of rows) m.set(t.category, (m.get(t.category) ?? 0) + cents(t)); return m }
  const expected = new Set<string>(['5.00']) // the application's stated minor-category threshold, "under 5.00% each"
  for (const rows of [outflows, outflows.filter((t) => t.date.startsWith('2026-01')), outflows.filter((t) => t.date.startsWith('2026-02'))]) {
    const total = rows.reduce((sum, t) => sum + cents(t), 0), categories = byCategory(rows)
    expected.add(fmt(total)); expected.add(fmt(total - Math.max(...categories.values()))); expected.add(share(total - Math.max(...categories.values()), total))
    for (const amount of categories.values()) { expected.add(fmt(amount)); expected.add(share(amount, total)) }
  }
  const inflow = tx.filter((t) => t.direction === 'inflow').reduce((sum, t) => sum + cents(t), 0)
  expected.add(fmt(inflow)); expected.add(fmt(inflow - outflows.reduce((sum, t) => sum + cents(t), 0)))
  {
    const jan = byCategory(outflows.filter((t) => t.date.startsWith('2026-01'))), feb = byCategory(outflows.filter((t) => t.date.startsWith('2026-02')))
    const pair = (before: number, after: number) => { expected.add(fmt(Math.abs(after - before))); if (before) expected.add((Math.abs(after - before) * 100 / before).toFixed(2)) }
    pair([...jan.values()].reduce((x, y) => x + y, 0), [...feb.values()].reduce((x, y) => x + y, 0))
    for (const key of new Set([...jan.keys(), ...feb.keys()])) pair(jan.get(key) ?? 0, feb.get(key) ?? 0)
  }
  const verified = () => expected
  const housingAction = /\b(?:reduc\w*|cut\w*|lower\w*|renegotiat\w*|downsiz\w*|relocat\w*|optimi[sz]\w*|trim\w*|review\w*|manag\w*|focus(?:ing)? on)\b[^.!?\n]{0,40}\b(?:housing|rent|mortgage|essential categor\w*|essential expenses?)\b/i
  const SEEDS = [2026, 2027]
  for (seed of SEEDS) {
    const where = await ask('Where did most of my money go?')
    assert.match(where.answer, /Housing/); assert.match(where.answer, /2800\.00|91\.33%/)
    assert.doesNotMatch(where.answer, housingAction)
    const compare = await ask('Compare the latest two months of spending.')
    assert.match(compare.answer, /233\.77|14\.17%/)
    for (const question of ['What should I do to improve my spending habits?', 'How can I reduce my spending?', 'How can I save money without changing rent?']) {
      const report = await ask(question)
      assert.ok(['checked', 'withheld'].includes(report.explanationStatus), `${question} seed ${seed}: ${report.explanationStatus}`)
      assert.ok((report.explanationAttempts?.length ?? 0) <= 2, 'at most two attempts')
      assert.match(report.answer, /Groceries|Transport|Shopping|Subscriptions|Dining/, question)
      assert.doesNotMatch(report.answer, housingAction, `${question} seed ${seed} recommended changing Housing:\n${report.answer}`)
      assert.doesNotMatch(report.answer, /^\s*(?:[-*]\s*)?\**Housing\**\s*:/m)
    }
    const housing = await ask('How can I reduce my housing costs?')
    assert.match(housing.answer, /Housing/i)
    assert.ok(['checked', 'withheld'].includes(housing.explanationStatus))
    for (const report of [where, compare, housing]) for (const number of report.answer.replace(/\b\d{4}-\d{2}(?:-\d{2})?\b/g, ' ').match(/\d[\d,]*\.\d{2}/g) ?? []) assert.ok(verified().has(number.replace(/,/g, '').replace(/^-/, '')), `seed ${seed}: ${number} is not a verified figure in:\n${report.answer}`)
  }
})
