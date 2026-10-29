import { useCallback } from 'react'

import { getModelSettings } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Card, ErrorBox, Loading, PageHeader } from '../components/ui.jsx'
import { percent } from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'

// Each part's commit opens on GitHub, where its notebook and results can be read.
const REPO = 'https://github.com/BilliartMuthoni/confidence-calibrated-crop-diagnosis'

function Part({ part }) {
  return (
    <div className="grid gap-1 py-4 sm:grid-cols-[14rem_1fr]">
      <dt className="text-sm text-muted">{part.label}</dt>
      <dd>
        <span className="font-semibold text-ink">{typeof part.value === 'number' ? percent(part.value, 1) : part.value}</span>
        {part.note && <span className="mt-0.5 block text-sm text-body">{part.note}</span>}
        <span className="mt-1 block text-xs leading-5 text-faint">
          {part.source} - results in <code>{part.results}</code>, commit{' '}
          {/^[0-9a-f]{7,40}$/.test(part.commit) ? (
            <a href={`${REPO}/commit/${part.commit}`} target="_blank" rel="noreferrer"
               className="font-mono font-semibold text-primary underline" title="Open this commit on GitHub">
              {part.commit}
            </a>
          ) : <code>{part.commit}</code>}, {part.date}
        </span>
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
        subtitle="What the diagnosis runs on, and where each part came from. Changed only through the notebooks and a reviewed update."
      />
      <Card>
        <dl className="divide-y divide-divider">
          {data.parts.map((part) => <Part key={part.label} part={part} />)}
          <div className="grid gap-1 py-4 sm:grid-cols-[14rem_1fr]">
            <dt className="text-sm text-muted">Calibration and threshold chosen on</dt>
            <dd className="text-body">{data.fitted_on}</dd>
          </div>
        </dl>
      </Card>
    </>
  )
}
