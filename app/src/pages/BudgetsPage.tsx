import { Card } from '../components.tsx'

export default function BudgetsPage() {
  return (
    <section className="budgets" aria-label="Budgets">
        <Card title="Budgets Overview">
            <p>View and manage your budgets</p>
        </Card>
    </section>
  )
}