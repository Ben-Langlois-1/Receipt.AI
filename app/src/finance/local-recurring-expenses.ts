import { parseDate } from './dates.ts'
import type { RecurrenceFrequency, RecurringExpense } from './types.ts'

const STORAGE_KEY = 'receipt-ai.recurring-expenses.v1'

function isFrequency(value: unknown): value is RecurrenceFrequency {
  return value === 'weekly' || value === 'monthly' || value === 'yearly'
}

function isRecurringExpense(value: unknown): value is RecurringExpense {
  if (!value || typeof value !== 'object') return false

  const expense = value as Partial<RecurringExpense>
  return (
    typeof expense.sourceTransactionId === 'string' &&
    expense.sourceTransactionId.trim().length > 0 &&
    typeof expense.description === 'string' &&
    typeof expense.category === 'string' &&
    typeof expense.amountCents === 'number' &&
    Number.isInteger(expense.amountCents) &&
    expense.amountCents >= 0 &&
    isFrequency(expense.frequency) &&
    typeof expense.startDate === 'string' &&
    parseDate(expense.startDate) === expense.startDate
  )
}

export function loadLocalRecurringExpenses(): RecurringExpense[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []

    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isRecurringExpense) : []
  } catch {
    return []
  }
}

export function saveLocalRecurringExpenses(expenses: RecurringExpense[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses))
}
