import { useCallback } from 'react'

import { getModelSettings } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Card, ErrorBox, Loading, PageHeader } from '../components/ui.jsx'
import { percent } from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'

function Row({ label, value, note }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[14rem_1fr]">
      <dt className="text-sm text-muted">{label}</dt>
      <dd>
        <span className="text-body">{value}</span>
        {note && <span className="mt-0.5 block text-xs text-faint">{note}</span>}
      </dd>
    </div>
  )
}

// Read-only on purpose: the model, calibration and threshold change only through the
// notebooks and a reviewed pull request, never from a web form.
export default function ModelSettingsPage() {
  const { token } = useAuth()
  const load = useCallback(() => getModelSettings(token), [token])
  const { data, error, loading, reload } = useLoad(load)

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  return (
    <>
      <PageHeader
        title="Model settings"
        subtitle="What the diagnosis currently runs on. These change only through the training notebooks and a reviewed update, not from this portal."
      />
      <Card>
        <dl className="divide-y divide-divider">
          <Row label="Image model" value={data.image_model} />
          <Row label="Symptom text model" value={data.text_model} note="Used only when the farmer types a description; without one the answer is the image model's." />
          <Row label="Calibration" value={data.calibration} />
          <Row label="Referral threshold" value={percent(data.threshold)} note={data.threshold_note} />
          <Row label="Chosen on" value={data.fitted_on} />
        </dl>
      </Card>
    </>
  )
}
