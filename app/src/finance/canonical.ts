import { escapeCsvField } from './csv.ts'
import { formatAmount } from './money.ts'
import { CANONICAL_COLUMNS, CANONICAL_HEADER, type LedgerTransaction } from './types.ts'

function field(row: LedgerTransaction, column: (typeof CANONICAL_COLUMNS)[number]): string {
  switch (column) {
    case 'date':
      return row.date
    case 'posted_date':
      return row.posted_date
    case 'description':
      return row.description
    case 'amount':
      return formatAmount(row.amount)
    case 'currency':
      return row.currency
    case 'direction':
      return row.direction
    case 'category':
      return row.category
    case 'account':
      return row.account
    case 'source_bank':
      return row.source_bank
    case 'external_id':
      return row.external_id
  }
}

export function toCanonicalCsv(rows: LedgerTransaction[]): string {
  const lines = [CANONICAL_HEADER]
  for (const row of rows) {
    lines.push(CANONICAL_COLUMNS.map((column) => escapeCsvField(field(row, column))).join(','))
  }
  return `${lines.join('\n')}\n`
}
