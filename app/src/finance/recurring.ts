import { parseDate } from './dates.ts'
import type { RecurrenceFrequency, RecurringExpense } from './types.ts'

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000

export interface UpcomingRecurringExpense extends RecurringExpense {
  nextDate: string
}

function parseDateKey(value: string): Date | null {
  if (parseDate(value) !== value) return null
  const [year, month, day] = value.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day))
}

function toDateKey(date: Date): string {
  return [
    String(date.getUTCFullYear()).padStart(4, '0'),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-')
}

function dateInMonth(anchor: Date, year: number, month: number): Date {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  return new Date(Date.UTC(
    year,
    month,
    Math.min(anchor.getUTCDate(), lastDay),
  ))
}

function dateInYear(anchor: Date, year: number): Date {
  return dateInMonth(anchor, year, anchor.getUTCMonth())
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_IN_MILLISECONDS)
}

export function localDateKey(date = new Date()): string {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')
}

export function nextOccurrenceDate(
  startDate: string,
  frequency: RecurrenceFrequency,
  onOrAfterDate: string,
): string | null {
  const anchor = parseDateKey(startDate)
  const fromDate = parseDateKey(onOrAfterDate)
  if (!anchor || !fromDate) return null
  if (anchor >= fromDate) return toDateKey(anchor)

  if (frequency === 'weekly') {
    const elapsedDays = Math.floor((fromDate.getTime() - anchor.getTime()) / DAY_IN_MILLISECONDS)
    const intervals = Math.ceil(elapsedDays / 7)
    return toDateKey(addDays(anchor, intervals * 7))
  }

  if (frequency === 'monthly') {
    const monthOffset =
      (fromDate.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
      fromDate.getUTCMonth() - anchor.getUTCMonth()
    let occurrence = dateInMonth(
      anchor,
      anchor.getUTCFullYear(),
      anchor.getUTCMonth() + monthOffset,
    )
    if (occurrence < fromDate) {
      occurrence = dateInMonth(
        anchor,
        anchor.getUTCFullYear(),
        anchor.getUTCMonth() + monthOffset + 1,
      )
    }
    return toDateKey(occurrence)
  }

  if (frequency === 'yearly') {
    let occurrence = dateInYear(anchor, fromDate.getUTCFullYear())
    if (occurrence < fromDate) {
      occurrence = dateInYear(anchor, fromDate.getUTCFullYear() + 1)
    }
    return toDateKey(occurrence)
  }

  return null
}

export function getUpcomingRecurringExpenses(
  expenses: RecurringExpense[],
  today: string,
  windowDays = 7,
): UpcomingRecurringExpense[] {
  const todayDate = parseDateKey(today)
  if (!todayDate) throw new RangeError('today must be a valid YYYY-MM-DD date')
  if (!Number.isInteger(windowDays) || windowDays < 0) {
    throw new RangeError('windowDays must be a non-negative integer')
  }

  const lastDate = toDateKey(addDays(todayDate, windowDays))

  return expenses
    .flatMap((expense) => {
      const nextDate = nextOccurrenceDate(expense.startDate, expense.frequency, today)
      return nextDate && nextDate <= lastDate ? [{ ...expense, nextDate }] : []
    })
    .sort((a, b) =>
      a.nextDate.localeCompare(b.nextDate) ||
      a.description.localeCompare(b.description),
    )
}
