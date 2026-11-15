import { Card, Button, StatusBadge } from '../components.tsx'

import type { LedgerTransaction } from '../finance/types.ts'

// importing JavScript
import { totalAmount, SpendingIncome } from '../JavaScript/calculations.js'

type TransactionsPageProps = {
    transactions: LedgerTransaction[]
}


export default function OverviewPage({ transactions }: TransactionsPageProps) {

    const net = totalAmount(transactions)

    const { spendingTotal, incomeTotal } = SpendingIncome(transactions)

  return ( <>

        <h2>Monthly Summary</h2>

    <section className="kpi-grid" aria-label="Key finance metrics">
        <Card title="Spending">
            <p className="metric">$2,184</p>
        </Card>
        <Card title="Income">
            <p className="metric">$4,850</p>
        </Card>
        <Card title="Net cash flow">
            <p className="metric">$2,932</p>
        </Card>
        <Card title="Remaining budget">
            <p className="metric">$1,168</p>
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
    </section>

        <h2>Visualizations</h2>
    <section className="split-grid">
        <Card title="Spending by category">
            <p className="muted">Chart placeholder</p>
            <div className="bar-row">
            <span>Housing</span>
            <div className="bar"><span style={{ width: '82%' }} /></div>
            </div>
            <div className="bar-row">
            <span>Dining</span>
            <div className="bar"><span style={{ width: '48%' }} /></div>
            </div>
            <div className="bar-row">
            <span>Groceries</span>
            <div className="bar"><span style={{ width: '36%' }} /></div>
            </div>
        </Card>

        <Card title="Monthly trend">
            <p className="muted">No data visualization wired yet.</p>
            <div className="empty-state">No data for this chart yet.</div>
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
                <th>Status</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>{transactions[transactions.length -1]?.date}</td>
                    <td>{transactions[transactions.length -1]?.description}</td>
                    <td>{transactions[transactions.length -1]?.amount}</td>
                    <td>{transactions[transactions.length -1]?.category}</td>
                    <td><StatusBadge label="User Confirmed" kind="good" /></td>
                </tr>
                <tr>
                    <td>{transactions[transactions.length -2]?.date}</td>
                    <td>{transactions[transactions.length -2]?.description}</td>
                    <td>{transactions[transactions.length -2]?.amount}</td>
                    <td>{transactions[transactions.length -2]?.category}</td>
                    <td><StatusBadge label="Suggested" kind="info" /></td>
                </tr>
                <tr>
                    <td>{transactions[transactions.length -3]?.date}</td>
                    <td>{transactions[transactions.length -3]?.description}</td>
                    <td>{transactions[transactions.length -3]?.amount}</td>
                    <td>{transactions[transactions.length -3]?.category}</td>
                    <td><StatusBadge label="Uncategorized" kind="warn" /></td>
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