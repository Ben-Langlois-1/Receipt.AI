import './App.css'
import { useState } from 'react' // React state helpers and types, changed from 'import React, { useState } from 'react'' to avoid importing the entire React namespace

// import pages from '.pages/'
import OverviewPage from './pages/OverviewPage'
import TransactionsPage from './pages/TransactionsPage'
import BudgetsPage from './pages/BudgetsPage'
import RecurringExpensesPage from './pages/Recurring-ExpensesPage'
import AIAdvisorPage from './pages/AI-AdvisorPage'
import SettingsandPrivacyPage from './pages/Settings-and-PrivacyPage'

import { Card, Button} from './components.tsx'

function App() {

  // =============================== NAV ITEM SETUP AND STATE MANAGEMENT ===============================

  const [activeNavItem, setActiveNavItem] = useState('Overview') // State to track the currently active navigation item

  const navItems = [
    'Overview',
    'Transactions',
    'Budgets',
    'Recurring Expenses',
    'AI Advisor',
    'Settings & Privacy',
  ]

  const navDescriptions: Record<string, string> = { // Descriptions for each navigation item to display below the page title
    'Overview': 'View your overall financial health and key metrics.',
    'Transactions': 'Browse and manage your financial transactions.',
    'Budgets': 'Set and track your budgets for different categories.',
    'Recurring Expenses': 'Manage your recurring expenses and subscriptions.',
    'AI Advisor': 'Get AI-driven insights and recommendations for your finances.',
    'Settings & Privacy': 'Adjust your app settings and privacy preferences.',
   }

  function renderPage() {
    switch (activeNavItem) {
      case 'Transactions':
        return <TransactionsPage/>

      case 'Budgets': // =================== START OF BUDGETS PAGE ===================
        return <BudgetsPage/>
      
      case 'Recurring Expenses': // =================== START OF RECURRING EXPENSES PAGE ===================
        return <RecurringExpensesPage/>

      case 'AI Advisor': // =================== START OF AI ADVISOR PAGE ===================
        return <AIAdvisorPage/>

      case 'Settings & Privacy': // =================== START OF SETTINGS & PRIVACY PAGE ===================
        return <SettingsandPrivacyPage/>

      case 'Overview': // =================== START OF OVERVIEW PAGE =================== default view when the app is first loaded
      default:
        return <OverviewPage/>
    }

  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Primary navigation">
        <h1 className="app-title">Receipt.AI</h1>
        <p className="subtitle">Personal finance, locally.</p>
        <nav>
          <ul className="nav-list">
            {navItems.map((item) => (
              <li key={item}>
                <button className={`nav-item ${item === activeNavItem ? 'active' : ''}`} //sets active page based on the state of activeNavItem, allows change with onClick event
                  onClick={() => setActiveNavItem(item)}>
                  {item}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </aside>

      <div className="main-column">
        <header className="top-bar">
          <div>

            {/* Dynamically updates page title based on active nav item */}
            <h2>{ activeNavItem == 'Overview' ? 'Overview Dashboard' : activeNavItem } 
              </h2> 

            <p className="muted">{navDescriptions[activeNavItem]}</p>
            <p className="muted">October 2026</p>
          </div>
          <div className="top-actions">
            <Button variant="secondary">Import CSV</Button>
            <Button variant="primary">Review Uncategorized</Button>
          </div>
        </header>

        <main className="content">
          {renderPage()}
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
