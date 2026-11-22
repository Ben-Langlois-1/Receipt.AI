import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getUpcomingRecurringExpenses,
  nextOccurrenceDate,
} from '../src/finance/recurring.ts'
import type { RecurringExpense } from '../src/finance/types.ts'

function expense(
  sourceTransactionId: string,
  startDate: string,
  frequency: RecurringExpense['frequency'],
): RecurringExpense {
  return {
    sourceTransactionId,
    description: sourceTransactionId,
    category: 'Housing',
    amountCents: 10000,
    frequency,
    startDate,
  }
}

test('weekly schedules return the first occurrence on or after the requested date', () => {
  assert.equal(
    nextOccurrenceDate('2026-11-01', 'weekly', '2026-11-19'),
    '2026-11-22',
  )
})

test('monthly schedules clamp month-end dates and retain the original anchor day', () => {
  assert.equal(
    nextOccurrenceDate('2026-01-31', 'monthly', '2026-02-01'),
    '2026-02-28',
  )
  assert.equal(
    nextOccurrenceDate('2026-01-31', 'monthly', '2026-03-01'),
    '2026-03-31',
  )
})

test('yearly schedules handle leap-day anchors in non-leap years', () => {
  assert.equal(
    nextOccurrenceDate('2024-02-29', 'yearly', '2025-01-01'),
    '2025-02-28',
  )
  assert.equal(
    nextOccurrenceDate('2024-02-29', 'yearly', '2028-03-01'),
    '2029-02-28',
  )
})

test('upcoming list includes dates through day seven and excludes day eight', () => {
  const expenses = [
    expense('today', '2026-11-22', 'weekly'),
    expense('seven-days', '2026-11-29', 'weekly'),
    expense('eight-days', '2026-11-30', 'weekly'),
  ]

  const upcoming = getUpcomingRecurringExpenses(expenses, '2026-11-22')

  assert.deepEqual(
    upcoming.map(({ sourceTransactionId, nextDate }) => ({
      sourceTransactionId,
      nextDate,
    })),
    [
      { sourceTransactionId: 'today', nextDate: '2026-11-22' },
      { sourceTransactionId: 'seven-days', nextDate: '2026-11-29' },
    ],
  )
})

test('upcoming expenses are sorted by next occurrence date', () => {
  const expenses = [
    expense('later', '2026-11-28', 'weekly'),
    expense('sooner', '2026-11-24', 'weekly'),
  ]

  assert.deepEqual(
    getUpcomingRecurringExpenses(expenses, '2026-11-22')
      .map(({ sourceTransactionId }) => sourceTransactionId),
    ['sooner', 'later'],
  )
})
