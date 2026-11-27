import { useState } from 'react'

import { downloadReport } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Button, Card, PageHeader } from '../components/ui.jsx'

// Counts only: no names, phone numbers, photos or symptom descriptions ever leave the system
// here (sproutly-backend/app/core/reports.py). Each download is recorded in the audit log.
const REPORTS = [
  {
    name: 'disease-frequency',
    title: 'Disease frequency',
    use: 'For county disease surveillance: which diseases are rising, and where.',
    columns: 'Month, county, crop, disease, automatic diagnoses, confirmed by an officer, total.',
    rule: 'When an officer has judged a case, their judgement counts instead of the model\'s result. Counts from 1 to 4 show as "<5" so a single farm cannot be singled out.',
  },
  {
    name: 'referral-performance',
    title: 'Referral performance',
    use: 'For county managers: whether officers are keeping up with shared cases.',
    columns: 'Month, county, received, answered, answered before the deadline, expired, still open, median days to reply.',
    rule: 'Counts of officers\' work only, so nothing is hidden.',
  },
]

export default function ReportsPage() {
  const { token } = useAuth()
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')

  async function download(name) {
    setBusy(name)
    setError('')
    try {
      await downloadReport(token, name)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy('')
    }
  }

  return (
    <>
      <PageHeader title="Reports"
                  subtitle="CSV files of counts by county and month. No names, phone numbers, photos or symptom descriptions." />

      <div className="grid gap-6 lg:grid-cols-2">
        {REPORTS.map((r) => (
          <Card key={r.name} className="flex flex-col p-0">
            <div className="flex-1 space-y-3 px-5 py-4">
              <h2 className="text-base font-semibold text-ink">{r.title}</h2>
              <p className="text-sm text-ink">{r.use}</p>
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="font-semibold text-muted">Columns</dt>
                  <dd className="text-ink">{r.columns}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-muted">Privacy</dt>
                  <dd className="text-ink">{r.rule}</dd>
                </div>
              </dl>
            </div>
            <div className="border-t border-divider px-5 py-3">
              <Button busy={busy === r.name} disabled={busy !== '' && busy !== r.name} onClick={() => download(r.name)}>
                Download CSV
              </Button>
            </div>
          </Card>
        ))}
      </div>

      {error && <p role="alert" className="mt-4 text-sm text-attention-ink">{error}</p>}
    </>
  )
}
