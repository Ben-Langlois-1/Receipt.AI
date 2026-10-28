export const CANONICAL_COLUMNS = [
  'date',
  'posted_date',
  'description',
  'amount',
  'currency',
  'direction',
  'category',
  'account',
  'source_bank',
  'external_id',
] as const

export type CanonicalColumn = (typeof CANONICAL_COLUMNS)[number]

export const CANONICAL_HEADER = CANONICAL_COLUMNS.join(',')

export type Direction = 'outflow' | 'inflow'

export type CategorySource = 'rule' | 'bank' | 'file' | 'manual'

export interface LedgerTransaction {
  date: string
  posted_date: string
  description: string
  amount: number
  currency: string
  direction: Direction
  category: string
  category_source: CategorySource
  account: string
  source_bank: string
  external_id: string
}

export interface ImportIssue {
  row: number | null
  severity: 'error' | 'warning'
  message: string
}

export interface ImportResult {
  ok: boolean
  profileId: string | null
  profileLabel: string | null
  transactions: LedgerTransaction[]
  issues: ImportIssue[]
}

export interface ImportOptions {
  account?: string
  bank?: string
}
