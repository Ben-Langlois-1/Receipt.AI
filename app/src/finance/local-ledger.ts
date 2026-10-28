import { sortLedger } from './ledger.ts'
import type { CategorySource, Direction, LedgerTransaction } from './types.ts'

const STORAGE_KEY = 'receipt-ai.ledger.v1'

function isDirection(value: unknown): value is Direction {
  return value === 'outflow' || value === 'inflow'
}

function isSource(value: unknown): value is CategorySource {
  return value === 'rule' || value === 'bank' || value === 'file' || value === 'manual'
}

function isRow(value: unknown): value is LedgerTransaction {
  if (!value || typeof value !== 'object') return false
  const row = value as Partial<LedgerTransaction>
  return (
    typeof row.date === 'string' &&
    typeof row.posted_date === 'string' &&
    typeof row.description === 'string' &&
    typeof row.amount === 'number' &&
    typeof row.currency === 'string' &&
    isDirection(row.direction) &&
    typeof row.category === 'string' &&
    isSource(row.category_source) &&
    typeof row.account === 'string' &&
    typeof row.source_bank === 'string' &&
    typeof row.external_id === 'string'
  )
}

export function loadLocalLedger(): LedgerTransaction[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return sortLedger(parsed.filter(isRow))
  } catch {
    return []
  }
}

export function saveLocalLedger(rows: LedgerTransaction[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows))
}

export function clearLocalLedger(): void {
  localStorage.removeItem(STORAGE_KEY)
}
