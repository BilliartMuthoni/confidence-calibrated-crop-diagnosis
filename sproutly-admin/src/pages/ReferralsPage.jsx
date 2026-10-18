import { useCallback, useState } from 'react'
import { Link } from 'react-router'

import { listReferrals } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, inputClass } from '../components/ui.jsx'
import { COUNTIES, CROPS, daysLeft, diseaseName, percent, timeAgo } from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'

const TABS = [['waiting', 'Waiting'], ['answered', 'Answered'], ['expired', 'Expired'], ['', 'All']]

export default function ReferralsPage() {
  const { token, user } = useAuth()
  const [status, setStatus] = useState('waiting')
  const [county, setCounty] = useState('')
  const load = useCallback(() => listReferrals(token, { status, county }), [token, status, county])
  const { data, error, loading, reload } = useLoad(load)

  return (
    <>
      <PageHeader
        title="Referrals"
        subtitle={
          user.role === 'admin'
            ? 'Photos the model was not confident about, shared by farmers who agreed to send them to an officer.'
            : `Cases from ${user.county} that the model was not confident about. The farmer agreed to share each photo with you.`
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(([value, label]) => (
          <button key={label} type="button" onClick={() => setStatus(value)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${status === value ? 'bg-primary text-white' : 'bg-white text-muted hover:text-ink'}`}>
            {label}
          </button>
        ))}
        {user.role === 'admin' && (
          <select className={`${inputClass} ml-auto w-auto`} value={county} onChange={(e) => setCounty(e.target.value)}
                  aria-label="County">
            <option value="">All counties</option>
            {COUNTIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
      </div>

      {loading ? <Loading /> : error ? <ErrorBox error={error} onRetry={reload} /> : data.length === 0 ? (
        <Card><Empty>No referrals here. New cases appear when the model is not confident and the farmer agrees to share the photo.</Empty></Card>
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-divider">
            {data.map((r) => (
              <li key={r.id}>
                <Link to={`/referrals/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 hover:bg-surface">
                  <span className={`h-2.5 w-2.5 rounded-full ${r.status === 'waiting' ? 'bg-expert' : r.status === 'answered' ? 'bg-healthy' : 'bg-faint'}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">
                      {CROPS[r.crop]} - {r.county}
                    </span>
                    <span className="block text-sm text-muted">
                      Model's best guess: {diseaseName(r.guess.disease)} ({percent(r.guess.confidence)} sure)
                      {r.symptoms_text && ' - farmer described symptoms'}
                    </span>
                  </span>
                  <span className="text-right text-xs text-faint">
                    {timeAgo(r.created_at)}
                    {r.status === 'waiting' && <span className="block">{daysLeft(r.expires_at)} days left to answer</span>}
                  </span>
                  <Badge tone={r.status}>{r.status}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  )
}
