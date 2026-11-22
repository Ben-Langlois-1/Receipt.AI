import test from 'node:test'
import assert from 'node:assert/strict'

import { // testing these three functions
  SpendingIncome,
  recentTransaction,
  last30Days,
} from '../src/JavaScript/calculations.js'

// =============== SpendingIncome =============

test('SpendingIncome inflow/outflow', () => {
  const transactions = [ // sample transactions
    { amount: 100, direction: 'inflow' },
    { amount: -40, direction: 'outflow' },
    { amount: 25, direction: 'inflow' },
  ]

  const result = SpendingIncome(transactions) 

  assert.deepEqual(result, { // compare expected result to actual result
    spendingTotal: -40,
    incomeTotal: 125,
  })
})

test('SpendingIncome returns zero totals for empty array', () => {
  assert.deepEqual(
    SpendingIncome([]),
    {
      spendingTotal: 0,
      incomeTotal: 0,
    }
  )
})

test('SpendingIncome ignores transactions with unknown directions', () => {
  const transactions = [
    { amount: 50, direction: 'inflow' },
    { amount: -20, direction: 'outflow' },
    { amount: 999, direction: 'unknown' }, // will throw this away
  ]

  const result = SpendingIncome(transactions)

  assert.equal(result.incomeTotal, 50)
  assert.equal(result.spendingTotal, -20)
})

// ================= recentTransactions ==================

test('recentTransaction reports No data for an empty array', () => {
  assert.equal(recentTransaction([]), 'No data')
})

test('recentTransaction returns a date from a sorted array', () => {
  const transactions = [
    { date: '2026-11-01' },
    { date: '2026-11-10' },
    { date: '2026-11-20' },
  ]

  assert.equal(recentTransaction(transactions), '2026-11-20')
})

test('recentTransaction finds the latest date in an unsorted array', () => {
  const transactions = [
    { date: '2026-11-20' },
    { date: '2026-10-15' },
    { date: '2026-11-25' },
  ]

  assert.equal(recentTransaction(transactions), '2026-11-25')
})

// ====================== last30Days ===================

function dateFromToday(daysAgo) {
  const date = new Date()

  date.setUTCDate(date.getUTCDate() - daysAgo)

  return date.toISOString().slice(0, 10)
}

test('last30Days includes today and excludes future transactions', () => {
  const futureDate = new Date()
  futureDate.setUTCDate(futureDate.getUTCDate() + 1)

  const transactions = [
    { date: dateFromToday(0) },
    { date: futureDate.toISOString().slice(0, 10) },
  ]

  const result = last30Days(transactions)

  assert.equal(result.length, 1)
  assert.equal(result[0].date, dateFromToday(0))
})

test('last30Days includes exactly 30 days ago', () => {
  const transactions = [
    { date: dateFromToday(30) },
  ]

  assert.equal(last30Days(transactions).length, 1)
})

test('last30Days excludes transactions older than 30 days', () => {
  const transactions = [
    { date: dateFromToday(31) },
  ]

  assert.equal(last30Days(transactions).length, 0)
})

test('last30Days returns an empty array for no transactions', () => {
  assert.deepEqual(last30Days([]), [])
})

test('last30Days ignores invalid dates', () => {
  const transactions = [
    { date: 'not-a-date' },
  ]

  assert.deepEqual(last30Days(transactions), [])
})
