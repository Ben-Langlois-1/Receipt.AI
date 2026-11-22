import { Card } from '../components.tsx'
import type { LedgerTransaction } from '../finance/types.ts'
import { formatUsd } from '../finance/money.ts'

type TransactionsPageProps = {
    transactions: LedgerTransaction[]
}



export default function TransactionsPage({ transactions }: TransactionsPageProps) {

    const totalAmount = transactions.reduce((sum, transaction) => sum + transaction.amount, 0) // calculates the total amount of all transactions
    console.log('Total Amount:', totalAmount) // logs the total amount to the console for debugging purposes

  return (<>

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
                    {[...transactions].reverse().map((transaction) => (
                        <tr key={transaction.external_id}>
                            <td>{transaction.date}</td>
                            <td>{transaction.description}</td>
                            <td>{formatUsd(transaction.amount)} {transaction.currency}</td>
                            <td>{transaction.category}</td>
                        </tr>
                    ))
                    }
                </tbody>
            </table>
        </Card>
    </section>

</>
)}