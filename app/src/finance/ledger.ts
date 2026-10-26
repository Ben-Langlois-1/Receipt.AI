import type { LedgerTransaction } from './types.ts'

export function sortLedger(rows: LedgerTransaction[]): LedgerTransaction[] {
  return [...rows].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.description.localeCompare(b.description) ||
      a.external_id.localeCompare(b.external_id),
  )
}

export function mergeLedger(existing: LedgerTransaction[], incoming: LedgerTransaction[]): LedgerTransaction[] {
  const map = new Map(existing.map((row) => [row.external_id, row]))
  for (const row of incoming) {
    const previous = map.get(row.external_id)
    if (previous?.category_source === 'manual') {
      map.set(row.external_id, {
        ...row,
        category: previous.category,
        category_source: 'manual',
      })
    } else {
      map.set(row.external_id, row)
    }
  }
  return sortLedger([...map.values()])
}

export function withCategory(rows: LedgerTransaction[], externalId: string, category: string): LedgerTransaction[] {
  return rows.map((row) =>
    row.external_id === externalId ? { ...row, category, category_source: 'manual' } : row,
  )
}
