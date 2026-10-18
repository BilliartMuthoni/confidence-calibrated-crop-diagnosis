import { useCallback } from 'react'
import { Link } from 'react-router'

import { getOverview } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { BarList, Card, ErrorBox, Loading, PageHeader } from '../components/ui.jsx'
import { diseaseName, percent } from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'

function Stat({ label, value, note, to }) {
  const body = (
    <Card className={to ? 'transition hover:border-primary/40' : ''}>
      <p className="text-sm text-muted">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums text-ink">{value}</p>
      {note && <p className="mt-1 text-xs text-faint">{note}</p>}
    </Card>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

/** FR x: how confident the model was on the cases it referred, in bins of 0.1. */
function ReferredConfidence({ bins }) {
  const max = Math.max(1, ...bins.map(([, count]) => count))
  return (
    <div>
      <div className="flex h-40 items-end gap-2 border-b border-divider">
        {bins.map(([low, count]) => (
          <div key={low} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${percent(low)}-${percent(low + 0.1)}: ${count} cases`}>
            <span className="text-xs tabular-nums text-muted">{count}</span>
            <span className="w-full max-w-10 rounded-t bg-expert" style={{ height: `${(count / max) * 120}px` }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-2">
        {bins.map(([low]) => (
          <span key={low} className="flex-1 text-center text-xs tabular-nums text-faint">{percent(low)}</span>
        ))}
      </div>
      <p className="mt-3 text-xs leading-5 text-faint">
        Confidence the model gave each referred case (start of each 10% band). Cases near the threshold are the ones a
        better model would most likely have answered correctly.
      </p>
    </div>
  )
}

export default function OverviewPage() {
  const { token } = useAuth()
  const load = useCallback(() => getOverview(token), [token])
  const { data, error, loading, reload } = useLoad(load)

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />

  return (
    <>
      <PageHeader title="Overview" subtitle="How Sproutly is being used this week, and where farmers are waiting for an expert." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Checks this week" value={data.checks_this_week} />
        <Stat label="Referred to an officer" value={percent(data.referred_this_week / data.checks_this_week)}
              note={`${data.referred_this_week} of ${data.checks_this_week} checks`} />
        <Stat label="Referrals waiting" value={data.waiting_referrals} note="Open the queue" to="/referrals" />
        <Stat label="Answered within 7 days" value={percent(data.answered_within_7_days)}
              note="Unanswered cases fall back to the contacts list" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 font-bold text-ink">Most common results</h2>
          <BarList rows={data.top_results.map(([cls, count]) => [diseaseName(cls), count])} />
        </Card>
        <Card>
          <h2 className="mb-4 font-bold text-ink">Checks by county</h2>
          <BarList rows={data.by_county} />
        </Card>
        <Card className="lg:col-span-2">
          <h2 className="mb-4 font-bold text-ink">How sure the model was on referred cases</h2>
          <ReferredConfidence bins={data.referred_confidence} />
        </Card>
      </div>
    </>
  )
}
