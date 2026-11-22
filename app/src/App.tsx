import './App.css'
import { useRef, useState } from 'react' // React state helpers and types, changed from 'import React, { useState } from 'react'' to avoid importing the entire React namespace

// importing import logic and types
import { importStatement } from './finance/import-statement.ts' // imports 
import type { ImportResult } from './finance/types.ts' // imports the type definition for the result of the importStatement function

// importing and saving data

import { mergeLedger } from './finance/ledger.ts' // imports the mergeLedger function to combine new transactions with existing ledger data
import { loadLocalLedger, saveLocalLedger } from './finance/local-ledger.ts' // imports functions to load and save the ledger data from/to local storage
import type { LedgerTransaction } from './finance/types.ts' // imports the type definition for a ledger transaction

// importing Budgets
import type { Budget, RecurringExpense } from './finance/types.ts'
import { loadLocalBudgets, saveLocalBudgets } from './finance/local-budgets.ts'
import {
  loadLocalRecurringExpenses,
  saveLocalRecurringExpenses,
} from './finance/local-recurring-expenses.ts'
import {
  getUpcomingRecurringExpenses,
  localDateKey,
} from './finance/recurring.ts'
import { formatUsd } from './finance/money.ts'


// importing pages
import OverviewPage from './pages/OverviewPage'
import TransactionsPage from './pages/TransactionsPage'
import BudgetsPage from './pages/BudgetsPage'
import RecurringExpensesPage from './pages/Recurring-ExpensesPage'
import AIAdvisorPage from './pages/AI-AdvisorPage'
import SettingsandPrivacyPage from './pages/Settings-and-PrivacyPage'

import ImportPreview from './pages/ImportPreview.tsx' // imports the ImportPreview component to display the result of the import operation


import { recentTransaction } from './JavaScript/calculations.js'

// importing components
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

  // =============================== FILE INPUT ===============================

  const fileInputRef = useRef<HTMLInputElement>(null) // Ref to the hidden file input element

  // =============================== DATA IMPORT (pending data/filename) ===============================

  const [pendingImport, setPendingImport] = useState<ImportResult | null>(null) // State to hold the result of the import operation (can either be sucess or fail/null)
  const [pendingFileName, setPendingFileName] = useState('') // State to hold the name of the file being imported

  // =============================== DATA STORAGE (ledger) ===============================

  const [ledger, setLedger] = useState<LedgerTransaction[]>(() => loadLocalLedger()) // State to hold the current ledger data, initialized with data loaded from local storage
  const [budgets, setBudgets] = useState<Budget[]>(() => loadLocalBudgets())
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpense[]>(
    () => loadLocalRecurringExpenses(),
  )

  function handleBudgetsChange(nextBudgets: Budget[]) {
    saveLocalBudgets(nextBudgets)
    setBudgets(nextBudgets)
  }

  function handleRecurringExpensesChange(nextExpenses: RecurringExpense[]) {
    saveLocalRecurringExpenses(nextExpenses)
    setRecurringExpenses(nextExpenses)
  }

  const upcomingRecurringExpenses = getUpcomingRecurringExpenses(
    recurringExpenses,
    localDateKey(),
  )

  const mostRecent = recentTransaction(ledger)

  function handleImportConfirmation() { // Function to handle the confirmation of the import operation
    if (!pendingImport?.ok) return // If the import result is not successful, do nothing

    const updatedLedger = mergeLedger(ledger, pendingImport.transactions) // Merge the new transactions with the existing ledger
    saveLocalLedger(updatedLedger) // Save the updated ledger to local storage
    setLedger(updatedLedger) // Update the state with the new ledger data

    setPendingImport(null) // Clear the pending import state
    setPendingFileName('') // Clear the pending file name state
  }

  // ================================= PAGE RENDERING BASED ON ACTIVE NAV ITEM =================================

  function renderPage() {
    switch (activeNavItem) {
      case 'Transactions':
        return <TransactionsPage transactions={ledger} />

      case 'Budgets': // =================== START OF BUDGETS PAGE ===================
        return <BudgetsPage budgets={budgets} onBudgetsChange={handleBudgetsChange} transactions={ledger}/>
      
      case 'Recurring Expenses': // =================== START OF RECURRING EXPENSES PAGE ===================
        return (
          <RecurringExpensesPage
            transactions={ledger}
            recurringExpenses={recurringExpenses}
            onRecurringExpensesChange={handleRecurringExpensesChange}
          />
        )

      case 'AI Advisor': // =================== START OF AI ADVISOR PAGE ===================
        return <AIAdvisorPage/>

      case 'Settings & Privacy': // =================== START OF SETTINGS & PRIVACY PAGE ===================
        return <SettingsandPrivacyPage/>

      case 'Overview': // =================== START OF OVERVIEW PAGE =================== default view when the app is first loaded
      default:
        return <OverviewPage transactions={ledger} budgets={budgets}/>
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
            <p className="muted">Most recent transaction imported: {mostRecent}</p>
          </div>
          <div className="top-actions">

{/* ============================ IMPORT CSV BUTTON ============================ */}

            <Button variant="secondary"

            // click on button refers to the hidden input element
              onClick={() => {
                fileInputRef.current?.click()
              }}>

                Import CSV

            </Button>


            {/* hidden input element */}
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" hidden 
              onChange={async (e) => {
                const file = e.currentTarget.files?.[0]
                if (!file) return

                try {
                  const text = await file.text()
                  console.log(`Read ${file.name}: ${text.length} characters`)

                  const transactionsResult = importStatement(text) // sends the text of the CSV file to the importStatement function for processing
                    //transactionResult returns the object containing sucess/fail status, profile label, transaction count, and issues
                  
                  setPendingImport(transactionsResult) // updates PendingImport with the result of the importStatement function (success or fail)
                  setPendingFileName(file.name) // updates PendingFileName with the name of the file being imported
                    // "pending" means it has been processed but not yet reviewed, so is only stored in memory

                  console.log({
                    fileName: file.name,
                    success: transactionsResult.ok,
                    format: transactionsResult.profileLabel,
                    transactionCount: transactionsResult.transactions.length,
                    issues: transactionsResult.issues,
                  })

                } catch (error) {
                  console.error('Error reading file:', error)
                }

            }} />

            <Button variant="primary" onClick={() => console.log('Review Uncategorized clicked')}>Review Uncategorized</Button>
            
          </div>
        </header>

        <main className="content">
          {pendingImport && (
            <ImportPreview filename={pendingFileName} importResult={pendingImport} 
            onConfirm={handleImportConfirmation}
            onClose={() => { // sends filename and import to ImportPreview
              setPendingImport(null) // clears the pending import state when the close button is clicked
              setPendingFileName('') // clears the pending file name state when the close button is clicked
            }}
            />
          )}
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
        <Card title="Recurring expenses in the next 7 days">
          {upcomingRecurringExpenses.length === 0 ? (
            <p className="muted">None expected in the next 7 days.</p>
          ) : (
            <ul>
              {upcomingRecurringExpenses.map((expense) => (
                <li key={expense.sourceTransactionId}>
                  <strong>{expense.description}</strong>
                  <p>
                    {formatUsd(expense.amountCents / 100)} · {expense.frequency} ·{' '}
                    {new Intl.DateTimeFormat('en-US', {
                      month: 'short',
                      day: 'numeric',
                      timeZone: 'UTC',
                    }).format(new Date(`${expense.nextDate}T00:00:00Z`))}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </aside>
    </div>
  )
}

export default App
