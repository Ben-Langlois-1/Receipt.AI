import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAdvisorContext } from '../src/ai/financial-context.ts'
import type { LedgerTransaction } from '../src/finance/types.ts'

const row = (date: string, category: string, amount: number, direction: 'outflow' | 'inflow' = 'outflow', currency = 'USD'): LedgerTransaction => ({
  date, posted_date: date, description: 'Private merchant', amount, direction, currency,
  category, category_source: 'rule', account: 'Secret account', source_bank: 'Secret bank', external_id: 'Secret ID',
})

test('produces accurate monthly category totals without leaking raw metadata', () => {
  const result = buildAdvisorContext([
    row('2026-10-02', 'Dining', -15.13),
    row('2026-10-05', 'Dining', -12.40),
    row('2026-11-01', 'Groceries', -40.21),
    row('2026-11-02', 'Salary', 400, 'inflow'),
  ])
  const usd = result.currencies[0]
  assert.equal(usd.currency, 'USD')
  assert.equal(usd.totals.spending, 67.74)
  assert.equal(usd.totals.income, 400)
  assert.equal(usd.totals.netCashFlow, 332.26)
  assert.deepEqual(usd.previousMonthCategories, [{ category: 'Dining', spending: 27.53 }])
  assert.deepEqual(usd.latestMonthCategories, [{ category: 'Groceries', spending: 40.21 }])
  const json = JSON.stringify(result)
  for (const secret of ['Private merchant', 'Secret bank', 'Secret account', 'Secret ID']) assert.equal(json.includes(secret), false)
})

test('keeps different currencies separate', () => {
  const result = buildAdvisorContext([
    row('2026-11-01', 'Dining', -12, 'outflow', 'USD'),
    row('2026-11-01', 'Dining', -10, 'outflow', 'EUR'),
  ])
  assert.deepEqual(result.currencies.map((x) => x.currency), ['EUR', 'USD'])
  assert.equal(result.currencies[0].totals.spending, 10)
  assert.equal(result.currencies[1].totals.spending, 12)
})

test('handles empty data', () => {
  const result = buildAdvisorContext([])
  assert.equal(result.dataRange, null)
  assert.deepEqual(result.currencies, [])
})

test('last six months means calendar months even when imports have gaps', () => {
  const result = buildAdvisorContext([
    row('2026-01-05', 'Dining', -10),
    row('2026-05-05', 'Dining', -20),
    row('2026-11-05', 'Dining', -30),
  ])
  const usd = result.currencies[0]
  assert.equal(usd.lastSixMonthsCategories[0].spending, 30)
  assert.equal(usd.previousMonthCategories.length, 0)
  assert.equal(usd.monthlyCategoryTotals.length, 12)
})
