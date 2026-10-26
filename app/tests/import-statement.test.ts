import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { toCanonicalCsv } from '../src/finance/canonical.ts'
import { importStatement } from '../src/finance/import-statement.ts'
import { mergeLedger, withCategory } from '../src/finance/ledger.ts'
import { parseCsv } from '../src/finance/csv.ts'
import { centsToNumber, summarize } from '../src/finance/summary.ts'
import { CANONICAL_HEADER } from '../src/finance/types.ts'

function readBank(name: string): string {
  return readFileSync(`fixtures/banks/${name}`, 'utf8')
}

function byDescription(description: string) {
  return (row: { description: string }) => row.description === description
}

test('chase checking becomes the canonical ledger and skips a bad date', () => {
  const result = importStatement(readBank('chase-checking.csv'), { account: 'Chase Checking' })
  assert.equal(result.ok, true)
  assert.equal(result.profileId, 'chase_checking')
  assert.equal(result.transactions.length, 12)
  assert.equal(result.issues.length, 1)
  assert.match(result.issues[0]?.message ?? '', /not-a-date/)

  const netflix = result.transactions.find(byDescription('NETFLIX.COM 866-579-7172 CA'))
  assert.ok(netflix)
  assert.equal(netflix.date, '2026-01-03')
  assert.equal(netflix.amount, -15.99)
  assert.equal(netflix.direction, 'outflow')
  assert.equal(netflix.category, 'Subscriptions')
  assert.equal(netflix.account, 'Chase Checking')
  assert.equal(netflix.source_bank, 'chase_checking')

  const payroll = result.transactions.find((row) => row.description.includes('PAYROLL') && row.date === '2026-01-05')
  assert.equal(payroll?.category, 'Income')
  assert.equal(payroll?.direction, 'inflow')
  assert.equal(payroll?.amount, 2450)

  const amazon = result.transactions.find((row) => row.description.includes('AMAZON'))
  assert.equal(amazon?.description, 'AMAZON MARKETPLACE, SEATTLE')
  assert.equal(amazon?.category, 'Shopping')

  assert.equal(result.transactions.find((row) => row.description.includes('KROGER'))?.category, 'Groceries')
  assert.equal(result.transactions.find((row) => row.description.includes('SHELL'))?.category, 'Transport')
  assert.equal(result.transactions.find((row) => row.description.includes('COMCAST'))?.category, 'Utilities')
  assert.equal(result.transactions.find((row) => row.description.includes('STARBUCKS'))?.category, 'Dining')
  assert.equal(result.transactions.find((row) => row.description.includes('RENT'))?.category, 'Housing')
  assert.equal(result.transactions.find((row) => row.description.includes('ATM FEE'))?.category, 'Fees')

  const summary = summarize(result.transactions)
  assert.equal(summary.outflowCents, 306575)
  assert.equal(summary.inflowCents, 490000)
  assert.equal(centsToNumber(summary.netCents), 1834.25)
  assert.equal(summary.byMonth.length, 2)
  assert.equal(summary.byCategory[0]?.category, 'Housing')

  const csv = toCanonicalCsv(result.transactions)
  assert.ok(csv.startsWith(`${CANONICAL_HEADER}\n`))
  assert.match(csv, /"AMAZON MARKETPLACE, SEATTLE"/)
  const roundTrip = importStatement(csv)
  assert.equal(roundTrip.ok, true)
  assert.equal(roundTrip.profileId, 'canonical_v1')
  assert.equal(roundTrip.transactions.length, result.transactions.length)
  assert.deepEqual(
    roundTrip.transactions.map((row) => row.external_id),
    result.transactions.map((row) => row.external_id),
  )
  assert.equal(roundTrip.transactions.find((row) => row.description.includes('NETFLIX'))?.category, 'Subscriptions')
})

test('other bank exports land on the same columns and signs', () => {
  const credit = importStatement(readBank('chase-credit.csv'), { account: 'Chase Credit' })
  assert.equal(credit.profileId, 'chase_credit')
  assert.equal(credit.transactions.find(byDescription('LOCAL ART FAIR'))?.category, 'Entertainment')
  assert.equal(credit.transactions.find(byDescription('LOCAL ART FAIR'))?.category_source, 'bank')
  assert.equal(credit.transactions.find(byDescription('LOCAL ART FAIR'))?.posted_date, '2026-01-13')
  assert.equal(credit.transactions.find(byDescription('PAYMENT THANK YOU'))?.direction, 'inflow')
  assert.equal(credit.transactions.find((row) => row.description.includes('AMAZON'))?.amount, -34.12)

  const bofa = importStatement(readBank('bank-of-america.csv'))
  assert.equal(bofa.profileId, 'bank_of_america')
  assert.equal(bofa.transactions.length, 1)
  assert.equal(bofa.transactions[0]?.category, 'Transport')
  assert.match(bofa.issues[0]?.message ?? '', /summary/i)

  const wells = importStatement(readBank('wells-fargo.csv'))
  assert.equal(wells.profileId, 'wells_fargo')
  assert.equal(wells.transactions[0]?.amount, -62.1)
  assert.equal(wells.transactions[0]?.category, 'Utilities')

  const capital = importStatement(readBank('capital-one.csv'))
  assert.equal(capital.profileId, 'capital_one')
  assert.equal(capital.transactions.find((row) => row.description.includes('SPOTIFY'))?.amount, -11.99)
  assert.equal(capital.transactions.find((row) => row.description.includes('SPOTIFY'))?.category, 'Subscriptions')
  assert.equal(capital.transactions.find((row) => row.description.includes('ONLINE PAYMENT'))?.amount, 200)
  assert.equal(capital.transactions.find((row) => row.description.includes('ONLINE PAYMENT'))?.category, 'Transfers')

  const citi = importStatement(readBank('citi.csv'))
  assert.equal(citi.profileId, 'citi')
  assert.equal(citi.transactions.find((row) => row.description.includes('CVS'))?.category, 'Health')
  assert.equal(citi.transactions.find((row) => row.description.includes('CVS'))?.amount, -24.17)

  const amex = importStatement(readBank('american-express.csv'))
  assert.equal(amex.profileId, 'american_express')
  assert.equal(amex.transactions.find((row) => row.description.includes('ADOBE'))?.amount, -22.99)
  assert.equal(amex.transactions.find((row) => row.description.includes('ADOBE'))?.category, 'Subscriptions')
  assert.equal(amex.transactions.find((row) => row.description.includes('AUTOPAY'))?.amount, 200)
  assert.equal(amex.transactions.find((row) => row.description.includes('AUTOPAY'))?.direction, 'inflow')

  const discover = importStatement(readBank('discover.csv'))
  assert.equal(discover.profileId, 'discover')
  assert.equal(discover.transactions.find((row) => row.description.includes('HULU'))?.amount, -9.99)
  assert.equal(discover.transactions.find((row) => row.description.includes('HULU'))?.category, 'Subscriptions')
  const payment = discover.transactions.find((row) => row.description.includes('INTERNET PAYMENT'))
  assert.equal(payment?.amount, 100)
  assert.equal(payment?.category, 'Transfers')
  assert.equal(payment?.category_source, 'bank')
})

test('a generic file skips the preamble and a positive-only file warns', () => {
  const generic = importStatement(readBank('generic.csv'), { account: 'Cash' })
  assert.equal(generic.ok, true)
  assert.equal(generic.profileId, 'generic')
  assert.equal(generic.transactions.length, 2)
  assert.equal(generic.transactions.find((row) => row.description === 'CORNER CAFE')?.category, 'Uncategorized')
  assert.equal(generic.transactions[0]?.account, 'Cash')

  const positive = importStatement(readBank('positive-amounts.csv'))
  assert.equal(positive.ok, true)
  assert.equal(positive.transactions[0]?.direction, 'inflow')
  assert.match(positive.issues.map((issue) => issue.message).join(' '), /American Express or Discover/)
})

test('forcing Discover inverts a simple amount column', () => {
  const forced = importStatement(readBank('positive-amounts.csv'), { bank: 'discover' })
  assert.equal(forced.ok, true)
  assert.equal(forced.transactions[0]?.amount, -15.99)
  assert.equal(forced.transactions[0]?.direction, 'outflow')
  assert.match(forced.issues[0]?.message ?? '', /usual Discover/)
})

test('malformed files return an error and no rows', () => {
  for (const [name, pattern] of [
    ['header-only.csv', /no transaction rows/i],
    ['no-amount.csv', /date and an amount/i],
    ['not-a-statement.pdf.csv', /PDF/],
  ] as const) {
    const result = importStatement(readBank(name))
    assert.equal(result.ok, false, name)
    assert.equal(result.transactions.length, 0, name)
    assert.match(result.issues[0]?.message ?? '', pattern, name)
  }

  const empty = importStatement('')
  assert.match(empty.issues[0]?.message ?? '', /empty/i)
  const html = importStatement('<html><body>statement</body></html>')
  assert.match(html.issues[0]?.message ?? '', /web page/i)
  const junk = importStatement('hello\nworld\n')
  assert.match(junk.issues[0]?.message ?? '', /header row/i)
})

test('the same statement imports to the same ids, and a manual category survives a re-import', () => {
  const first = importStatement(readBank('citi.csv'), { account: 'Citi' })
  const second = importStatement(readBank('citi.csv'), { account: 'Citi' })
  assert.deepEqual(
    first.transactions.map((row) => row.external_id),
    second.transactions.map((row) => row.external_id),
  )
  const edited = withCategory(first.transactions, first.transactions[0]!.external_id, 'Dining')
  const merged = mergeLedger(edited, second.transactions)
  const kept = merged.find((row) => row.external_id === first.transactions[0]!.external_id)
  assert.equal(kept?.category, 'Dining')
  assert.equal(kept?.category_source, 'manual')
})

test('the committed Chase example is the exact canonical file', () => {
  const result = importStatement(readBank('chase-checking.csv'), { account: 'Chase Checking' })
  assert.equal(result.ok, true)
  assert.equal(toCanonicalCsv(result.transactions), readFileSync('fixtures/expected/chase-checking.csv', 'utf8'))
})

test('canonical csv parses back as records', () => {
  const result = importStatement(readBank('wells-fargo.csv'), { account: 'Wells' })
  const parsed = parseCsv(toCanonicalCsv(result.transactions))
  assert.deepEqual(parsed.rows[0], CANONICAL_HEADER.split(','))
  assert.equal(parsed.rows.length, 2)
})
