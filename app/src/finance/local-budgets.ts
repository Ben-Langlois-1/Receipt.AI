import type { Budget } from './types.ts'

const STORAGE_KEY = 'receipt-ai.budgets.v1'

function isBudget(value: unknown): value is Budget {
  if (typeof value !== 'object' || value === null) return false

  const item = value as Record<string, unknown>
  return (
    typeof item.month === 'string' &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(item.month) &&
    typeof item.category === 'string' &&
    item.category.trim().length > 0 &&
    typeof item.limitCents === 'number' &&
    Number.isInteger(item.limitCents) &&
    item.limitCents >= 0
  )
}

export function loadLocalBudgets(): Budget[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isBudget) : []
  } catch {
    return []
  }
}

export function saveLocalBudgets(budgets: Budget[]): void { // Saves budget list
  localStorage.setItem(STORAGE_KEY, JSON.stringify(budgets))
}