import { Card, Button } from '../components.tsx'

import type { Budget, LedgerTransaction } from '../finance/types.ts'

import type { FormEvent } from 'react'

import { CATEGORIES } from '../finance/categories.ts'
import { formatUsd, toCents } from '../finance/money.ts'

import { useState } from 'react'

const BUDGET_CATEGORIES = CATEGORIES.filter(
  (category) => category !== 'Income' && category !== 'Transfers',
)

type BudgetsPageProps =  {
  budgets: Budget[]
  onBudgetsChange: (nextBudgets: Budget[]) => void
  transactions: LedgerTransaction[]
}

export default function BudgetsPage({ budgets, onBudgetsChange, transactions }: BudgetsPageProps) {

    const [editingBudget, setEditingBudget] = useState<Budget | null>(null)

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault()

      const form = event.currentTarget
      const values = new FormData(form)
      const limit = Number(values.get('limit'))

      const month = editingBudget?.month ?? String(values.get('month') ?? '')
      const category = editingBudget?.category ?? String(values.get('category') ?? '')


      const updatedBudgets = budgets.filter(
        (budget) => budget.month !== month || budget.category !== category,
      )

      onBudgetsChange([
        ...updatedBudgets,
        { month, category, limitCents: Math.round(limit * 100) },
      ])

      setEditingBudget(null)

      form.reset()
    }

    function actualSpendCents(budget: Budget): number {
      return transactions.reduce((total, transaction) => {
        const matchesBudget =
          transaction.date.slice(0, 7) === budget.month &&
          transaction.category === budget.category &&
          transaction.direction === 'outflow'

        return matchesBudget
          ? total + Math.abs(toCents(transaction.amount))
          : total
      }, 0)
    }

    function handleDelete(budgetToDelete: Budget) {
      onBudgetsChange(
      budgets.filter(
        (budget) =>
          budget.month !== budgetToDelete.month ||
          budget.category !== budgetToDelete.category,
      ),
      )
    }

  return (<>
    <section className="budgets" aria-label="Budgets">
        <Card title="Budgets Overview">
            <p>{budgets.length} saved budgets</p>
        </Card>
    </section>

    <section className="budgets" aria-label='Budgets'>
      <Card title="All Budgets">

          {budgets.length === 0 ? (
            <p>No budgets yet.</p>
          ) : (
            <ul>
            {budgets.map((budget) => {
              const actualCents = actualSpendCents(budget)

              const remainingCents = budget.limitCents - actualCents
              const percentUsed =
                budget.limitCents === 0
                  ? actualCents > 0 ? 100 : 0
                  : (actualCents / budget.limitCents) * 100

              return (
                <li key={`${budget.month}-${budget.category}`}>
                  {budget.category} — {budget.month}:{' '}
                  {formatUsd(budget.limitCents / 100)}
                  <p>Actual spending: {formatUsd(actualCents / 100)}</p>

                  <p>Remaining: {formatUsd(remainingCents / 100)}</p>
                  <progress value={Math.min(percentUsed, 100)} max={100} />
                  <p>{percentUsed.toFixed(0)}% used</p>

                  <div className='space-buttons'>
                  <Button variant="secondary" onClick={() => setEditingBudget(budget)}>Edit Amount</Button>
                  <Button variant="secondary" onClick={() => handleDelete(budget)}>Delete</Button>
                  </div>

                </li>
              )
            })} 
            </ul>
          )}


      </Card>


    </section>

    <section className="budgets" aria-label='Budgets'>
      <Card title={editingBudget ? 'Edit Budget' : 'Add Budget'}>
        
        
        <form
          key={editingBudget ? `${editingBudget.month}-${editingBudget.category}` : 'new'}
          onSubmit={handleSubmit}>
            <div className='space-buttons'>
        <label>
          Month
          <input type="month" name="month" required defaultValue={(editingBudget?.month ?? '')} disabled={editingBudget !== null}/>
        </label>

        <label>
          Category
          <select name="category" defaultValue={editingBudget?.category ?? BUDGET_CATEGORIES[0]} disabled={editingBudget !== null}>
            {BUDGET_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label>
          Monthly limit
          <input type="number" name="limit" min="0" step="0.01" required
          defaultValue={
            editingBudget
              ? (editingBudget.limitCents / 100).toFixed(2)
              : ''
          }  />
        </label>
        <Button variant="primary">{editingBudget ? 'Update Budget' : 'Save budget'}</Button>
        </div>
        </form>

        {editingBudget && (
          <Button variant="tertiary" onClick={() => setEditingBudget(null)}>
            Cancel edit
          </Button>
        )}
        
      </Card>
    </section>
  </>)
}