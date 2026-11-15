import { Card } from '../components.tsx'
import type { LedgerTransaction } from '../finance/types.ts'

type TransactionsPageProps = {
    transactions: LedgerTransaction[]
}

export default function TransactionsPage({ transactions }: TransactionsPageProps) {
  return (<>
    <section className="transactions" aria-label="Transactions">
        <Card title="Transactions Overview">
            <p>View and manage your financial transactions</p>
        </Card>
    </section>

    <section className="transactions" aria-label="Transactions">
        <Card title="Transactions">
            <p>Imported Transactions</p>

            {/* ========================== Transaction table ========================== */}
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
                    {transactions.map((transaction) => (
                        <tr key={transaction.external_id}>
                            <td>{transaction.date}</td>
                            <td>{transaction.description}</td>
                            <td>{transaction.amount.toFixed(2)} {transaction.currency}</td>
                            <td>{transaction.category}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </Card>
    </section>

</>
)}