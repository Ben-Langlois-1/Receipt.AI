// Test-only state for the teammate-owned storage schemas; never real user data.
const keys = ['receipt-ai.ledger.v1', 'receipt-ai.budgets.v1', 'receipt-ai.recurring-expenses.v1']
async function readState(page) { return page.evaluate(names => Object.fromEntries(names.map(key => [key, JSON.parse(localStorage.getItem(key))])), keys) }
async function seedState(page) {
  await page.evaluate(() => {
    const rows = JSON.parse(localStorage.getItem('receipt-ai.ledger.v1'))
    rows[0].category_source = 'manual'
    localStorage.setItem('receipt-ai.ledger.v1', JSON.stringify(rows))
    localStorage.setItem('receipt-ai.budgets.v1', JSON.stringify([{ month: '2026-11', category: 'Dining', limitCents: 50000 }]))
    const subscription = rows.find(row => row.category === 'Subscriptions')
    localStorage.setItem('receipt-ai.recurring-expenses.v1', JSON.stringify([{ sourceTransactionId: subscription.external_id, description: 'Synthetic confirmed service', category: 'Subscriptions', amountCents: 7000, frequency: 'monthly', startDate: '2026-11-01' }]))
  })
  return readState(page)
}
module.exports = { readState, seedState }
