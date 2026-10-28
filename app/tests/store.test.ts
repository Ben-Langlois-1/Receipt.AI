import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { toCanonicalCsv } from '../src/finance/canonical.ts'
import { importStatement } from '../src/finance/import-statement.ts'
import { SqliteLedger } from '../cli/store-sqlite.ts'

test('sqlite keeps a manual category when the same statement is imported again', () => {
  const directory = mkdtempSync(join(tmpdir(), 'receipt-ai-'))
  const dbPath = join(directory, 'receipt.sqlite')
  const source = readFileSync('fixtures/banks/citi.csv', 'utf8')
  const imported = importStatement(source, { account: 'Citi' })
  assert.equal(imported.ok, true)

  const ledger = new SqliteLedger(dbPath)
  try {
    ledger.upsert(imported.transactions, '2026-10-25T12:00:00.000Z')
    const target = imported.transactions[0]!
    ledger.setCategory(target.external_id, 'Dining')
    ledger.upsert(imported.transactions, '2026-10-25T13:00:00.000Z')
    const rows = ledger.list()
    assert.equal(rows.length, 2)
    assert.equal(rows.find((row) => row.external_id === target.external_id)?.category, 'Dining')
    assert.equal(rows.find((row) => row.external_id === target.external_id)?.category_source, 'manual')
    const other = rows.find((row) => row.external_id !== target.external_id)
    assert.equal(other?.category, 'Transfers')
    assert.match(toCanonicalCsv(rows), /Dining/)
  } finally {
    ledger.close()
    rmSync(directory, { recursive: true, force: true })
  }
})
