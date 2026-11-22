import { useState } from 'react'
import { Button, Card } from '../components.tsx'
import { formatUsd, toCents } from '../finance/money.ts'
import { localDateKey, nextOccurrenceDate } from '../finance/recurring.ts'
import type {
  RecurrenceFrequency,
  RecurringExpense,
  LedgerTransaction,
} from '../finance/types.ts'

type RecurringExpensesPageProps = {
  transactions: LedgerTransaction[]
  recurringExpenses: RecurringExpense[]
  onRecurringExpensesChange: (expenses: RecurringExpense[]) => void
}

const FREQUENCIES: RecurrenceFrequency[] = ['weekly', 'monthly', 'yearly']

const dateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

function formatDate(date: string): string {
  return dateFormatter.format(new Date(`${date}T00:00:00Z`))
}

export default function RecurringExpensesPage({
  transactions,
  recurringExpenses,
  onRecurringExpensesChange,
}: RecurringExpensesPageProps) {
  const [formError, setFormError] = useState<string | null>(null)
  const today = localDateKey()
  const eligibleTransactions = transactions.filter(
    (transaction) =>
      transaction.direction === 'outflow' &&
      !recurringExpenses.some(
        (expense) => expense.sourceTransactionId === transaction.external_id,
      ),
  )

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const values = new FormData(event.currentTarget)
    const transactionId = String(values.get('transactionId') ?? '')
    const frequency = values.get('frequency')
    const transaction = transactions.find(
      (row) => row.external_id === transactionId && row.direction === 'outflow',
    )

    if (!transaction) {
      setFormError('Choose an expense transaction.')
      return
    }
    if (
      frequency !== 'weekly' &&
      frequency !== 'monthly' &&
      frequency !== 'yearly'
    ) {
      setFormError('Choose a recurrence frequency.')
      return
    }

    const recurringExpense: RecurringExpense = {
      sourceTransactionId: transaction.external_id,
      description: transaction.description,
      category: transaction.category,
      amountCents: Math.abs(toCents(transaction.amount)),
      frequency,
      startDate: transaction.date,
    }

    onRecurringExpensesChange([...recurringExpenses, recurringExpense])
    setFormError(null)
    event.currentTarget.reset()
  }

  function handleDelete(sourceTransactionId: string) {
    onRecurringExpensesChange(
      recurringExpenses.filter(
        (expense) => expense.sourceTransactionId !== sourceTransactionId,
      ),
    )
  }

  return (
    <section className="recurring-expenses" aria-label="Recurring Expenses">
      <Card title="Recurring Expenses">
        <p>Choose an expense transaction and set how often it repeats.</p>

        {recurringExpenses.length === 0 ? (
          <p className="muted">No recurring expenses set up yet.</p>
        ) : (
          <ul>
            {recurringExpenses.map((expense) => {
              const nextDate = nextOccurrenceDate(
                expense.startDate,
                expense.frequency,
                today,
              )

              return (
                <li key={expense.sourceTransactionId}>
                  <strong>{expense.description}</strong>
                  <p>
                    {expense.category} · {formatUsd(expense.amountCents / 100)} ·{' '}
                    {expense.frequency}
                  </p>
                  <p className="muted">
                    Next expected: {nextDate ? formatDate(nextDate) : 'Unavailable'}
                  </p>
                  <Button
                    variant="tertiary"
                    onClick={() => handleDelete(expense.sourceTransactionId)}
                  >
                    Remove
                  </Button>
                </li>
              )
            })}
          </ul>
        )}

        <h3>Add recurring expense</h3>
        {eligibleTransactions.length === 0 ? (
          <p className="muted">
            Import or add an expense transaction that is not already recurring.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label>
              Expense transaction
              <select name="transactionId" defaultValue="" required>
                <option value="" disabled>
                  Select a transaction
                </option>
                {eligibleTransactions.map((transaction) => (
                  <option
                    key={transaction.external_id}
                    value={transaction.external_id}
                  >
                    {transaction.date} · {transaction.description} ·{' '}
                    {formatUsd(Math.abs(transaction.amount))}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Repeat
              <select name="frequency" defaultValue="monthly">
                {FREQUENCIES.map((frequency) => (
                  <option key={frequency} value={frequency}>
                    {frequency[0].toUpperCase() + frequency.slice(1)}
                  </option>
                ))}
              </select>
            </label>

            {formError && <p role="alert">{formError}</p>}
            <Button variant="primary">Add recurring expense</Button>
          </form>
        )}
      </Card>
    </section>
  )
}
