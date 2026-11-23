import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolvePeriod } from '../src/ai/financial-facts.ts'
import { buildAdvisorContext } from '../src/ai/financial-context.ts'
import { importStatement } from '../src/finance/import-statement.ts'
import { askLocalAdvisor } from '../src/ai/local-advisor.ts'
const imported = importStatement(readFileSync(new URL('../fixtures/banks/sample-chase-november-2026.csv', import.meta.url), 'utf8'))
const context = buildAdvisorContext(imported.transactions)
test('coordinated month names share an explicit year', () => {
  assert.deepEqual(resolvePeriod('Compare January and February 2026', '2027-01-01', null), { months: ['2026-01', '2026-02'] })
  assert.deepEqual(resolvePeriod('Compare January 2026 and February', '2027-01-01', null), { months: ['2026-01', '2026-02'] })
  assert.deepEqual(resolvePeriod('December 2025 and January 2026', '2027-01-01', null), { months: ['2025-12', '2026-01'] })
  for (const q of ['January and February', 'December and January 2026', 'January and February 2025 and March 2026']) assert.ok(resolvePeriod(q, '2026-11-22', null).error)
})
test('reported amounts are net flow, not outflows, in the available fixture', () => {
  assert.equal(imported.ok, true)
  const months = context.facts.currencies[0].months
  const october = months.find((m) => m.month === '2026-10')!
  const november = months.find((m) => m.month === '2026-11')!
  assert.equal(october.outflowCents, 183449)
  assert.equal(november.outflowCents, 181850)
  assert.equal(october.inflowCents, 277612)
  assert.equal(november.inflowCents, 277612)
  assert.equal(october.netFlowCents, 94163)
  assert.equal(november.netFlowCents, 95762)
})
test('monthly figures, balances and missing data bypass model prose', async (t) => {
  const original = globalThis.fetch
  t.after(() => { globalThis.fetch = original })
  globalThis.fetch = (async () => { assert.fail('Deterministic response must not call model') }) as typeof fetch
  const answer = await askLocalAdvisor('Compare October and November 2026', context)
  assert.match(answer, /Imported outflows 1834.49; imported inflows 2776.12/)
  assert.match(answer, /Imported outflows 1818.50; imported inflows 2776.12/)
  assert.match(answer, /difference -15.99 USD/)
  const balance = await askLocalAdvisor('What is my balance?', context)
  assert.match(balance, /verified opening balance and sufficiently complete transaction history/)
  assert.match(balance, /actual verified account balance/)
  const missing = await askLocalAdvisor('How much did I spend in January 2026?', context)
  assert.match(missing, /Spending is unknown/)
  assert.doesNotMatch(missing, /compar/i)
  const comparison = await askLocalAdvisor('Compare January and February 2026', context)
  assert.match(comparison, /Comparison unavailable/)
})
