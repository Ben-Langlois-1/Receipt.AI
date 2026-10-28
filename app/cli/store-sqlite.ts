import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { formatAmount } from '../src/finance/money.ts'
import { TRANSACTIONS_SQL } from '../src/finance/schema.ts'
import type { CategorySource, LedgerTransaction } from '../src/finance/types.ts'

interface StoredRow {
  external_id: string
  date: string
  posted_date: string
  description: string
  amount: string
  currency: string
  direction: 'outflow' | 'inflow'
  category: string
  category_source: string
  account: string
  source_bank: string
}

function asSource(value: string): CategorySource {
  if (value === 'rule' || value === 'bank' || value === 'file' || value === 'manual') return value
  return 'rule'
}

export class SqliteLedger {
  private readonly db: DatabaseSync

  constructor(path: string) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = new DatabaseSync(path)
    this.db.exec(TRANSACTIONS_SQL)
  }

  upsert(rows: LedgerTransaction[], importedAt: string): void {
    const statement = this.db.prepare(`
      INSERT INTO transactions (
        external_id, date, posted_date, description, amount, currency, direction,
        category, category_source, account, source_bank, imported_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(external_id) DO UPDATE SET
        date = excluded.date,
        posted_date = excluded.posted_date,
        description = excluded.description,
        amount = excluded.amount,
        currency = excluded.currency,
        direction = excluded.direction,
        category = CASE
          WHEN transactions.category_source = 'manual' THEN transactions.category
          ELSE excluded.category
        END,
        category_source = CASE
          WHEN transactions.category_source = 'manual' THEN 'manual'
          ELSE excluded.category_source
        END,
        account = excluded.account,
        source_bank = excluded.source_bank,
        imported_at = excluded.imported_at
    `)
    this.db.exec('BEGIN')
    try {
      for (const row of rows) {
        statement.run(
          row.external_id,
          row.date,
          row.posted_date,
          row.description,
          formatAmount(row.amount),
          row.currency,
          row.direction,
          row.category,
          row.category_source,
          row.account,
          row.source_bank,
          importedAt,
        )
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  setCategory(externalId: string, category: string): void {
    this.db
      .prepare(`UPDATE transactions SET category = ?, category_source = 'manual' WHERE external_id = ?`)
      .run(category, externalId)
  }

  list(): LedgerTransaction[] {
    const rows = this.db
      .prepare(
        `SELECT external_id, date, posted_date, description, amount, currency, direction,
                category, category_source, account, source_bank
         FROM transactions
         ORDER BY date, description, external_id`,
      )
      .all() as unknown as StoredRow[]
    return rows.map((row) => ({
      external_id: row.external_id,
      date: row.date,
      posted_date: row.posted_date,
      description: row.description,
      amount: Number(row.amount),
      currency: row.currency,
      direction: row.direction,
      category: row.category,
      category_source: asSource(row.category_source),
      account: row.account,
      source_bank: row.source_bank,
    }))
  }

  close(): void {
    this.db.close()
  }
}
