import { Card, Button, StatusBadge } from '../components.tsx'

export default function OverviewPage() {
  return ( <>
    <section className="kpi-grid" aria-label="Key finance metrics">
        <Card title="Current month spending">
            <p className="metric">$2,184</p>
        </Card>
        <Card title="Total income">
            <p className="metric">$4,850</p>
        </Card>
        <Card title="Total expenses">
            <p className="metric">$2,932</p>
        </Card>
        <Card title="Remaining budget">
            <p className="metric">$1,168</p>
        </Card>
    </section>

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
                <td>2026-10-12</td>
                <td>North Grocery</td>
                <td>$84.22</td>
                <td>Groceries</td>
                <td><StatusBadge label="User Confirmed" kind="good" /></td>
                </tr>
                <tr>
                <td>2026-10-11</td>
                <td>Blue Bistro</td>
                <td>$42.10</td>
                <td>Dining</td>
                <td><StatusBadge label="Suggested" kind="info" /></td>
                </tr>
                <tr>
                <td>2026-10-10</td>
                <td>CloudPlay</td>
                <td>$9.99</td>
                <td>-</td>
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