import { buildFinancialFacts, validAdvisorRows, type FinancialFacts } from './financial-facts.ts'
import { summarize, centsToNumber } from '../finance/summary.ts'
import type { LedgerTransaction } from '../finance/types.ts'

/**
 * All figures are computed deterministically, before the language model sees them.
 * This deliberately excludes transaction descriptions, account names, bank names,
 * external IDs and transaction-level records from prompts.
 */
export interface CurrencyContext {
  currency: string
  totals: { transactions: number; spending: number; income: number; netCashFlow: number }
  monthlyTotals: Array<{ month: string; spending: number; income: number; netCashFlow: number }>
  categoryTotals: Array<{ category: string; spending: number }>
  latestMonthCategories: Array<{ category: string; spending: number }>
  previousMonthCategories: Array<{ category: string; spending: number }>
  lastSixMonthsCategories: Array<{ category: string; spending: number }>
  monthlyCategoryTotals: Array<{ month: string; categories: Array<{ category: string; spending: number }> }>
}

export interface AdvisorContext {
  facts: FinancialFacts
  source: 'imported local transaction ledger'
  dataRange: { earliest: string; latest: string } | null
  dateCounts: Array<{ date: string; transactions: number }>
  includedMonths: number
  currencies: CurrencyContext[]
  limitations: string[]
}

const categoryName = (name: string): string => name.trim() || 'Uncategorized'

function categoriesFor(rows: LedgerTransaction[]) {
  return summarize(rows).byCategory.map(({ category, outflowCents }) => ({
    category: categoryName(category),
    spending: centsToNumber(outflowCents),
  }))
}

export function buildAdvisorContext(rows: LedgerTransaction[]): AdvisorContext {
  const validRows = validAdvisorRows(rows)
  const sortedDates = validRows.map((row) => row.date).sort()
  const transactionCountsByDate = new Map<string, number>()
  for (const row of validRows) transactionCountsByDate.set(row.date, (transactionCountsByDate.get(row.date) ?? 0) + 1)
  const dateCounts = [...transactionCountsByDate].sort(([left], [right]) => left.localeCompare(right)).map(([date, transactions]) => ({ date, transactions }))
  const months = [...new Set(validRows.map((row) => row.date.slice(0, 7)))].sort()
  // Generate calendar months, including missing months (zero spending), based on
  // the latest imported record rather than incorrectly treating gaps as months.
  const newestMonth = months.at(-1)
  const last12 = newestMonth
    ? Array.from({ length: 12 }, (_, index) => {
      const [year, month] = newestMonth.split('-').map(Number)
      const date = new Date(Date.UTC(year, month - 1 - (11 - index), 1))
      return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
    })
    : []
  const last6 = last12.slice(-6)
  const currencies = [...new Set(validRows.map((row) => row.currency.trim().toUpperCase() || 'Unknown'))]
    .sort()
    .map((currency): CurrencyContext => {
      const currencyRows = validRows.filter((row) => (row.currency.trim().toUpperCase() || 'Unknown') === currency)
      const sum = summarize(currencyRows)
      const latestMonth = last12.at(-1)
      const previousMonth = last12.at(-2)
      const inMonth = (row: LedgerTransaction, month: string | undefined) => month !== undefined && row.date.startsWith(month)
      return {
        currency,
        totals: {
          transactions: currencyRows.length,
          spending: centsToNumber(sum.outflowCents),
          income: centsToNumber(sum.inflowCents),
          netCashFlow: centsToNumber(sum.netCents),
        },
        monthlyTotals: sum.byMonth.filter((month) => last12.includes(month.month)).map((month) => ({
          month: month.month,
          spending: centsToNumber(month.outflowCents),
          income: centsToNumber(month.inflowCents),
          netCashFlow: centsToNumber(month.inflowCents - month.outflowCents),
        })),
        categoryTotals: categoriesFor(currencyRows),
        latestMonthCategories: categoriesFor(currencyRows.filter((row) => inMonth(row, latestMonth))),
        previousMonthCategories: categoriesFor(currencyRows.filter((row) => inMonth(row, previousMonth))),
        lastSixMonthsCategories: categoriesFor(currencyRows.filter((row) => last6.includes(row.date.slice(0, 7)))),
        monthlyCategoryTotals: last12.map((month) => ({
          month,
          categories: categoriesFor(currencyRows.filter((row) => inMonth(row, month))),
        })),
      }
    })

  return {
    facts: buildFinancialFacts(validRows),
    source: 'imported local transaction ledger',
    dataRange: sortedDates.length ? { earliest: sortedDates[0], latest: sortedDates[sortedDates.length - 1] } : null,
    dateCounts,
    includedMonths: months.filter((month) => last12.includes(month)).length,
    currencies,
    limitations: [
      'Amounts are based only on uploaded transactions; unimported transactions cannot be inferred.',
      'Monthly comparisons cover the 12-calendar-month window ending at the latest imported month; older data is excluded from monthly breakdowns.',
      'Do not sum amounts in different currencies.',
      'Categories may be inaccurate until the user verifies them.',
      'No budget targets or recurring-expense detector results are included in this version.',
    ],
  }
}
