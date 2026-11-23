import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAdvisorContext } from '../src/ai/financial-context.ts'
import { calendarDate, percentageChange, resolvePeriod, queryFinancialFacts } from '../src/ai/financial-facts.ts'
import type { LedgerTransaction } from '../src/finance/types.ts'
const row = (date: string, amount: number, category = 'Dining'): LedgerTransaction => ({
  date, posted_date: '', amount, category, direction: amount < 0 ? 'outflow' : 'inflow', currency: 'USD', description: 'secret', account: 'secret', source_bank: 'secret', external_id: 'secret', category_source: 'manual',
})
const query = (rows: LedgerTransaction[], q: string) => queryFinancialFacts(buildAdvisorContext(rows).facts, q, '2026-11-22', 'America/Detroit')
test('timezone, rollover, explicit months and ambiguous dates', () => {
  assert.equal(calendarDate(new Date('2027-01-01T02:00:00Z')), '2026-12-31')
  assert.deepEqual(resolvePeriod('this month and previous month', '2027-01-01', '2025-03'), { months: ['2026-12', '2027-01'] })
  assert.deepEqual(resolvePeriod('November 2026 vs 2026-10', '2027-01-01', null), { months: ['2026-10', '2026-11'] })
  for (const q of ['November', '2026-13', 'last 30 days']) assert.ok(resolvePeriod(q, '2026-11-22', null).error)
})
test('current month never falls back to stale imports', () => {
  const result = query([row('2025-01-01', -10)], 'this month')
  assert.ok('currencies' in result)
  assert.equal(result.requestedPeriods[0].month, '2026-11')
  assert.equal(result.currencies[0].periods[0].outflowCents, null)
  assert.equal(result.currencies[0].periods[0].coverage, 'no_records')
})
test('exact cents, rankings, refunds and ambiguous income', () => {
  const result = buildAdvisorContext([row('2026-11-01', -0.1), row('2026-11-02', -0.2), row('2026-11-03', 5, 'Refund'), row('2026-11-04', 100, 'Income'), row('2026-11-05', -10, 'Transfers')]).facts.currencies[0].allImported
  assert.equal(result.outflowCents, 1030)
  assert.equal(result.inflowCents, 10500)
  assert.equal(result.categories[0].category, 'Transfers')
  assert.equal(result.transferOutflowCents, 1000)
  assert.equal(result.verifiedIncomeCents, null)
  assert.equal(result.verifiedExpenseCents, null)
})
test('percentage rounding, decreases and zero baselines', () => {
  assert.equal(percentageChange(110, 100), 10)
  assert.equal(percentageChange(2, 3), -33.33)
  assert.equal(percentageChange(0, 100), -100)
  assert.equal(percentageChange(0, 0), null)
  assert.equal(percentageChange(10, 0), null)
  assert.throws(() => percentageChange(-1, 10))
})
test('comparison computed only for imported records with unknown coverage', () => {
  const result = query([row('2026-10-01', -10), row('2026-11-01', -15)], 'compare last month and this month')
  assert.ok('currencies' in result)
  assert.equal(result.currencies[0].comparison.differenceCents, 500)
  assert.equal(result.currencies[0].comparison.percentageChange, 50)
  assert.equal(result.currencies[0].periods[0].coverage, 'unknown')
})
test('gaps block comparisons and six month totals describe found records', () => {
  const rows = [row('2026-06-01', -10), row('2026-11-01', -15)]
  const result = query(rows, 'compare last month and this month')
  assert.ok('currencies' in result)
  assert.equal(result.currencies[0].comparison.scope, 'unsupported')
  assert.deepEqual(result.currencies[0].requestedRecordTotals?.missingMonths, ['2026-10'])
  const six = query(rows, 'dining last six months')
  assert.ok('currencies' in six)
  assert.equal(six.requestedPeriods.length, 6)
  assert.equal(six.currencies[0].requestedRecordTotals?.outflowCents, 2500)
})
test('invalid rows excluded and overflow fails explicitly', () => {
  assert.equal(buildAdvisorContext([row('2026-02-30', -10), { ...row('2026-11-01', -10), direction: 'inflow' }]).dataRange, null)
  assert.throws(() => buildAdvisorContext([row('2026-11-01', 60_000_000_000_000), row('2026-11-02', 60_000_000_000_000)]), /precision/)
})
