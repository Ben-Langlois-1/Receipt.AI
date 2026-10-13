import './App.css'
import type { ReactNode } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'tertiary'

function Button({
  children,
  variant = 'secondary',
}: {
  children: ReactNode
  variant?: ButtonVariant
}) {
  return <button className={`btn ${variant}`}>{children}</button>
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card">
      <header className="card-header">
        <h3>{title}</h3>
      </header>
      {children}
    </section>
  )
}

function StatusBadge({ label, kind }: { label: string; kind: 'info' | 'warn' | 'good' }) {
  return <span className={`badge ${kind}`}>{label}</span>
}

function App() {
  const navItems = [
    'Overview',
    'Transactions',
    'Budgets',
    'Recurring Expenses',
    'AI Advisor',
    'Settings & Privacy',
  ]

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <h1 className="app-title">Receipt.AI</h1>
        <p className="subtitle">Personal finance, locally.</p>
        <nav>
          <ul className="nav-list">
            {navItems.map((item) => (
              <li key={item}>
                <button className={`nav-item ${item === 'Overview' ? 'active' : ''}`}>{item}</button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="main-column">
        <header className="top-bar">
          <div>
            <h2>Overview Dashboard</h2>
            <p className="muted">October 2026</p>
          </div>
          <div className="top-actions">
            <Button variant="secondary">Import CSV</Button>
            <Button variant="primary">Review Uncategorized</Button>
          </div>
        </header>

        <main className="content">
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
        </main>

        <footer className="status-strip">
          <span>Your financial data stays on this device.</span>
          <span>AI analysis is processed locally.</span>
          <span>No transaction data is uploaded.</span>
        </footer>
      </div>

      <aside className="details-panel">
        <h3>Details</h3>
        <p className="muted">Select a transaction or recommendation to see context and explanations.</p>
        <Card title="Upcoming recurring expense">
          <p>CloudPlay</p>
          <p className="muted">$9.99 monthly · next expected 2026-10-20</p>
        </Card>
      </aside>
    </div>
  )
}

export default App
