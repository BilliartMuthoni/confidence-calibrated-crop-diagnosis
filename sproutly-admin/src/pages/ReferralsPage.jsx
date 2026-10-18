import { useCallback, useState } from 'react'
import { Link } from 'react-router'

import { listReferrals } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, inputClass } from '../components/ui.jsx'
import { COUNTIES, CROPS, REFERRAL_STATUS, daysLeft, judgementName, timeAgo } from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'

// "Mine" = cases I have claimed or answered.
const TABS = [['new', 'New'], ['in_review', 'In review'], ['answered', 'Answered'], ['expired', 'Expired'], ['mine', 'Mine'], ['', 'All']]
const DOT = { new: 'bg-expert', in_review: 'bg-attention', answered: 'bg-healthy', expired: 'bg-faint' }

// The model's guess is left out of the list on purpose: officers judge each case before
// they see it (see ReferralDetailPage), so their judgements stay independent of the model.
function Summary({ referral: r, meId }) {
  if (r.status === 'answered') return <>Answered by {r.reply.officer}: {judgementName(r.reply.judgement)}</>
  if (r.status === 'in_review') return <>Being reviewed by {r.claimed_by.id === meId ? 'you' : r.claimed_by.name}</>
  if (r.status === 'expired') return <>No reply within 7 days</>
  return <>{r.symptoms_text ? 'Photo and the farmer\'s description' : 'Photo only'}</>
}

export default function ReferralsPage() {
  const { token, user } = useAuth()
  const [tab, setTab] = useState('new')
  const [county, setCounty] = useState('')
  const load = useCallback(
    () => listReferrals(token, { status: tab === 'mine' ? '' : tab, county, mine: tab === 'mine' }),
    [token, tab, county],
  )
  const { data, error, loading, reload } = useLoad(load)

  return (
    <>
      <PageHeader
        title="Referrals"
        subtitle={
          user.role === 'admin'
            ? 'Photos the model was not confident about, shared by farmers who agreed to send them to an officer.'
            : `Cases from ${user.county} that the model was not confident about. Claim a case before you answer it, so no one else answers it too.`
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {TABS.map(([value, label]) => (
          <button key={label} type="button" onClick={() => setTab(value)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${tab === value ? 'bg-primary text-white' : 'bg-white text-muted hover:text-ink'}`}>
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
            {data.map((r) => {
              const open = r.status === 'new' || r.status === 'in_review'
              const urgent = open && daysLeft(r.expires_at) <= 2
              return (
                <li key={r.id}>
                  <Link to={`/referrals/${r.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-4 hover:bg-surface">
                    <span className={`h-2.5 w-2.5 rounded-full ${DOT[r.status]}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-ink">{CROPS[r.crop]} - {r.county}</span>
                      <span className="block text-sm text-muted"><Summary referral={r} meId={user.id} /></span>
                    </span>
                    <span className="text-right text-xs text-faint">
                      {timeAgo(r.created_at)}
                      {open && (
                        <span className={`block ${urgent ? 'font-semibold text-attention' : ''}`}>
                          {daysLeft(r.expires_at)} days left to answer
                        </span>
                      )}
                    </span>
                    <Badge tone={r.status}>{REFERRAL_STATUS[r.status]}</Badge>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Card>
      )}
    </>
  )
}
