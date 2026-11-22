import { Button } from '../components'
import type { ImportResult } from '../finance/types'


// ensures correct datatypes are passed
type ImportPreviewProps = {
    filename: string
    importResult: ImportResult
    onClose: () => void
    onConfirm: () => void
}

export default function ImportPreview ({ filename, importResult, onClose, onConfirm }: ImportPreviewProps) {    
    return (   

    <div className="import-preview-overlay">

    <section 
        className="import-result" 
        aria-role="dialog"
        aria-modal="true"
        aria-labelledby="import-preview-title">

        <h2 id="import-preview-title">Import Preview for {filename}</h2>
        <p>Format: {importResult.profileLabel}</p>
        <p>Transactions: {importResult.transactions.length}</p>

        {importResult.ok ? (<>

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
                    {importResult.transactions.map((transaction) => (
                        <tr key={transaction.external_id}>
                            <td>{transaction.date}</td>
                            <td>{transaction.description}</td>
                            <td>{transaction.amount.toFixed(2)}</td>
                            <td>{transaction.category}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
            </>) : (<p>Import failed.</p>)}

        {importResult.issues.length > 0 && (
            <ul>
                {importResult.issues.map((issue, index) => (
                    <li key={`${issue.row}-${index}`}>{issue.message}</li>
                ))}
            </ul>)}

            <div className="space-buttons">

                <Button variant="primary" onClick={onConfirm}>Confirm Import</Button>
                <Button variant="secondary" onClick={onClose}>Close</Button>

            </div>

    </section>
    
    </div>)}
