import { Card, Button } from '../components.tsx'

import type { LedgerTransaction } from '../finance/types.ts'

// importing JavScript
import { totalAmount, SpendingIncome, totalTransactions } from '../JavaScript/calculations.js'

import { currentMonth} from '../JavaScript/calculations.js'
import { curMonth, curYear } from '../JavaScript/calculations.js'
import { currentMonthSpendingIncome, currentMonthNet } from '../JavaScript/calculations.js'

import { summarize } from '../finance/summary.ts'

type TransactionsPageProps = {
    transactions: LedgerTransaction[]
}


export default function OverviewPage({ transactions }: TransactionsPageProps) {

    const monthlyTransactions = currentMonth(transactions)

    const net = totalAmount(transactions)
    const curMonthNet = currentMonthNet(monthlyTransactions)
    const { spendingTotal, incomeTotal } = SpendingIncome(transactions)
    const { monthlySpending, monthlyIncome }= currentMonthSpendingIncome(monthlyTransactions)

// Bar graph
    // exclude categories that have no transactions
    const categorySpending = summarize(monthlyTransactions).byCategory.filter (({ category }) => category.trim() !== '')
    // largest category sets scale
    const maxCategorySpending = Math.max(0, ...categorySpending.map(({ outflowCents}) => outflowCents),)

// Line graph

    const monthlyTrend = summarize(transactions).byMonth //grabs one value per month

    const chartWidth = 600 // determines the dimensions
    const chartHeight = 260
    const padding = { top: 16, right: 16, bottom: 42, left: 58 }

    const plotWidth = chartWidth - padding.left - padding.right
    const plotHeight = chartHeight - padding.top - padding.bottom

    const maxCents = Math.max( // grabs the largest, to set scale
        1,
        ...monthlyTrend.flatMap(({ outflowCents, inflowCents }) => [
            outflowCents,
            inflowCents,
        ]),
    )

    const roundMax = (maxCents: number) => // decides whether to scale by 10 or 100 based on value
        maxCents <= 10000 
            ? Math.ceil(maxCents / 1000) * 1000
            : Math.ceil(maxCents / 10000) * 10000

    const maxCentsRounded = roundMax(maxCents)

    const xForMonth = (index: number) =>
        monthlyTrend.length === 1
            ? padding.left + plotWidth / 2
            : padding.left + (index / (monthlyTrend.length - 1)) * plotWidth

    const yForAmount = (cents: number) =>
        padding.top + plotHeight - (cents / maxCentsRounded) * plotHeight

    const spendingPoints = monthlyTrend
        .map(({ outflowCents }, index) => `${xForMonth(index)},${yForAmount(outflowCents)}`)
        .join(' ')

    const incomePoints = monthlyTrend
        .map(({ inflowCents }, index) => `${xForMonth(index)},${yForAmount(inflowCents)}`)
        .join(' ')

    const monthFormatter = new Intl.DateTimeFormat('en-US', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
    })

  return ( <>

        <h2>Monthly Summary - {curMonth}, {curYear}</h2>

    <section className="kpi-grid" aria-label="Key finance metrics">
        <Card title="Spending">
            <p className="metric">${Math.abs(monthlySpending).toFixed(2)}</p>
        </Card>
        <Card title="Income">
            <p className="metric">${monthlyIncome.toFixed(2)}</p>
        </Card>
        <Card title="Net cash flow">
            <p className="metric">${curMonthNet.toFixed(2)}</p>
        </Card>
        <Card title="Remaining budget">
            <p className="metric">---</p>
        </Card>
    </section>

        <h2>All-Time Activity</h2>
    <section className="kpi-grid" aria-label="Key finance metrics">
        <Card title="Net value">
            <p className="metric">${net.toFixed(2)}</p>
        </Card>

        <Card title="Total spending">
            <p className="metric">${Math.abs(spendingTotal).toFixed(2)}</p>
        </Card>

        <Card title="Total income">
            <p className="metric">${incomeTotal.toFixed(2)}</p>
        </Card>

        <Card title="Total transactions">
            <p className="metric">{totalTransactions(transactions)}</p>
        </Card>
    </section>

        <h2>Visualizations</h2>
    <section className="split-grid">
        <Card title="Spending by category">
            {categorySpending.length > 0 ? categorySpending.map(({ category, outflowCents, }) => (
                <div className="bar-row" key={category}>
                    <span>{category}</span>
                    <div className="bar">
                        <span style={{
                            width: maxCategorySpending > 0
                                ? `${(outflowCents / maxCategorySpending) * 100}%`
                                : '0%',
                        }} />
                    </div>
                </div>
            )) : (
                <div className="empty-state">No categorized spending this month</div>
            )}
        </Card>

        <Card title="Monthly trend">
            <p className="muted">Spending and income by imported month.</p>

            {monthlyTrend.length > 0 ? (
                <svg
                    className="trend-chart"
                    viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                    role="img"
                    aria-label="monthly line chart"
                >
                    {[0, maxCentsRounded / 2, maxCentsRounded].map((cents) => {
                        const y = yForAmount(cents)

                        return (
                            <g key={cents}>
                                <line
                                    x1={padding.left}
                                    x2={chartWidth - padding.right}
                                    y1={y}
                                    y2={y}
                                    className="trend-grid"
                                />
                                <text x={padding.left - 8} y={y + 4} textAnchor="end">
                                    ${(cents / 100).toFixed(2)}
                                </text>
                            </g>
                        )
                    })}

                    <polyline points={spendingPoints} className="trend-spending" />
                    <polyline points={incomePoints} className="trend-income" />

                    {monthlyTrend.map(({ month, outflowCents, inflowCents }, index) => {
                        const x = xForMonth(index)
                        const labelDate = new Date(`${month}-01T00:00:00Z`)

                        return (
                            <g key={month}>
                                <circle
                                    cx={x}
                                    cy={yForAmount(outflowCents)}
                                    r="4"
                                    className="trend-spending-point"
                                />
                                <circle
                                    cx={x}
                                    cy={yForAmount(inflowCents)}
                                    r="4"
                                    className="trend-income-point"
                                />
                                <text x={x} y={chartHeight - 12} textAnchor="middle">
                                    {monthFormatter.format(labelDate)}
                                </text>
                            </g>
                        )
                    })}
                </svg>
            ) : (
                <div className="empty-state">No monthly transaction data yet.</div>
            )}

            <p className="muted">Spending ━ Income ━</p>
        </Card>    
    </section>

    <section className="split-grid">
        <Card title="Recent transactions">
            <table className="table">
            <thead>
                <tr>
                <th>Date</th>
                <th>Merchant</th>
                <th>Amount</th>
                <th>Category</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>{transactions[transactions.length -1]?.date}</td>
                    <td>{transactions[transactions.length -1]?.description}</td>
                    <td>{transactions[transactions.length -1]?.amount}</td>
                    <td>{transactions[transactions.length -1]?.category}</td>
                </tr>
                <tr>
                    <td>{transactions[transactions.length -2]?.date}</td>
                    <td>{transactions[transactions.length -2]?.description}</td>
                    <td>{transactions[transactions.length -2]?.amount}</td>
                    <td>{transactions[transactions.length -2]?.category}</td>
                </tr>
                <tr>
                    <td>{transactions[transactions.length -3]?.date}</td>
                    <td>{transactions[transactions.length -3]?.description}</td>
                    <td>{transactions[transactions.length -3]?.amount}</td>
                    <td>{transactions[transactions.length -3]?.category}</td>
                </tr>
            </tbody>
            </table>
        </Card>

        <Card title="AI summary">
            <p>
            Dining spending increased by <strong>18%</strong> this month compared with last month.
            </p>
            <p className="muted">
            Why am I seeing this? 6 transactions across 3 merchants in the past 30 days.
            </p>
            <div className="card-actions">
            <Button variant="tertiary">Why this recommendation?</Button>
            <Button variant="secondary">Review category changes</Button>
            </div>
        </Card>
    </section>
    </>
  )
}