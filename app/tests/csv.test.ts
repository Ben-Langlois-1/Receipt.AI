import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parseCsv } from '../src/finance/csv.ts'
import { TRANSACTIONS_SQL } from '../src/finance/schema.ts'
import { CANONICAL_HEADER } from '../src/finance/types.ts'

test('parseCsv keeps commas and quotes inside a description', () => {
  const parsed = parseCsv('Date,Description,Amount\n01/02/2026,"AMAZON MARKETPLACE, ""SEATTLE""",-34.12\n')
  assert.equal(parsed.unclosedQuote, false)
  assert.deepEqual(parsed.rows[1], ['01/02/2026', 'AMAZON MARKETPLACE, "SEATTLE"', '-34.12'])
})

test('parseCsv accepts CRLF and a UTF-8 BOM', () => {
  const parsed = parseCsv('\uFEFFDate,Description\r\n01/02/2026,NETFLIX\r\n')
  assert.equal(parsed.rows[0]?.[0], 'Date')
  assert.equal(parsed.rows[1]?.[1], 'NETFLIX')
})

test('the committed header file is the canonical column list', () => {
  const header = readFileSync('schema/transactions.v1.csv', 'utf8')
  assert.equal(header, `${CANONICAL_HEADER}\n`)
})

test('the sqlite schema file matches the statement the importer runs', () => {
  const sql = readFileSync('schema/transactions.sql', 'utf8')
  assert.equal(sql, TRANSACTIONS_SQL)
})
