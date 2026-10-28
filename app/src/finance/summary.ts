import { toCents } from './money.ts'
import type { LedgerTransaction } from './types.ts'

export interface CategoryTotal {
  category: string
  outflowCents: number
}

export interface MonthTotal {
  month: string
  outflowCents: number
  inflowCents: number
}

export interface SpendingSummary {
  count: number
  outflowCents: number
  inflowCents: number
  netCents: number
  byCategory: CategoryTotal[]
  byMonth: MonthTotal[]
}

export function summarize(rows: LedgerTransaction[]): SpendingSummary {
  let outflowCents = 0
  let inflowCents = 0
  const categories = new Map<string, number>()
  const months = new Map<string, MonthTotal>()

  for (const row of rows) {
    const cents = Math.abs(toCents(row.amount))
    const month = row.date.slice(0, 7)
    const bucket = months.get(month) ?? { month, outflowCents: 0, inflowCents: 0 }
    if (row.direction === 'outflow') {
      outflowCents += cents
      categories.set(row.category, (categories.get(row.category) ?? 0) + cents)
      bucket.outflowCents += cents
    } else {
      inflowCents += cents
      bucket.inflowCents += cents
    }
    months.set(month, bucket)
  }

  return {
    count: rows.length,
    outflowCents,
    inflowCents,
    netCents: inflowCents - outflowCents,
    byCategory: [...categories.entries()]
      .map(([category, total]) => ({ category, outflowCents: total }))
      .sort((a, b) => b.outflowCents - a.outflowCents || a.category.localeCompare(b.category)),
    byMonth: [...months.values()].sort((a, b) => a.month.localeCompare(b.month)),
  }
}

export function centsToNumber(cents: number): number {
  return cents / 100
}
