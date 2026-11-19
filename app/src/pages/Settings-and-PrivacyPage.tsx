import { Card, Button } from '../components.tsx'

import { clearLocalLedger } from '../finance/local-ledger.ts'


export default function SettingsandPrivacyPage() {
  return ( <>
    <section className="settings-and-privacy" aria-label="Settings and Privacy">
        <Card title="Settings and Privacy">
            <p>Adjust your app settings and privacy preferences</p>
        </Card>
    </section>

    <section className="data" aria-label="Data">
      <Card title="Manage data">
        <Button variant="secondary"
        onClick={() => {
          const shouldDelete = window.confirm("Delete all transaction data?")

          if (!shouldDelete) return

          clearLocalLedger()
          window.location.reload()
          
        }}
        >Delete data</Button>
      </Card>
    </section>
    </>
  )
}