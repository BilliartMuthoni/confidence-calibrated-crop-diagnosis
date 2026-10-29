import { useCallback, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { listReferrals } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Badge, Empty, ErrorBox, Loading, PageHeader, Pagination, SortHeader, TableBox, Tabs, filterClass, inputClass } from '../components/ui.jsx'
import { COUNTIES, CROPS, judgementName, parseUtc, timeAgo, timeLeft } from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'
import { usePaged } from '../lib/usePaged.js'

// "Mine" = cases I have claimed or answered.
const OFFICER_TABS = [['new', 'Open'], ['in_review', 'In review'], ['mine', 'Mine'], ['answered', 'Answered'], ['expired', 'Expired'], ['', 'All']]
const ADMIN_TABS = [['new', 'Waiting'], ['in_review', 'In review'], ['answered', 'Answered'], ['expired', 'Expired'], ['', 'All']]
const OPEN = ['new', 'in_review']

// The model's guess is left out of the list on purpose: officers judge each case before
// they see it (see ReferralDetailPage), so their judgements stay independent of the model.
function Who({ referral: r, meId }) {
  if (r.status === 'answered') return <>{r.reply.officer}: {judgementName(r.reply.judgement)}</>
  if (r.status === 'in_review') return <>{r.claimed_by.id === meId ? 'You' : r.claimed_by.name}</>
  if (r.status === 'expired') return <span className="text-muted">Nobody replied</span>
  return <span className="text-muted">Not claimed</span>
}

function State({ referral: r }) {
  if (r.status === 'answered') return <Badge tone="answered">Answered</Badge>
  if (r.status === 'expired') return <Badge tone="expired">Expired</Badge>
  const left = timeLeft(r.expires_at)
  return <Badge tone={left.urgent ? 'urgent' : 'neutral'}>{left.text}</Badge>
}

// Time left: open cases with the least time left first; closed ones newest first.
const byUrgency = (a, b) => {
  const aOpen = OPEN.includes(a.status)
  const bOpen = OPEN.includes(b.status)
  if (aOpen !== bOpen) return aOpen ? -1 : 1
  return aOpen
    ? parseUtc(a.expires_at) - parseUtc(b.expires_at)
    : parseUtc(b.created_at) - parseUtc(a.created_at)
}
// Received: oldest first when ascending.
const byReceived = (a, b) => parseUtc(a.created_at) - parseUtc(b.created_at)

// Matches the case number, crop or county someone types.
const matches = (r, q) => !q || `#${r.id} ${r.id} ${CROPS[r.crop]} ${r.county ?? ''}`.toLowerCase().includes(q)

export default function ReferralsPage() {
  const { token, user } = useAuth()
  const navigate = useNavigate()
  const isAdmin = user.role === 'admin'
  const [tab, setTab] = useState('new')
  const [county, setCounty] = useState('')
  const load = useCallback(
    () => listReferrals(token, { status: tab === 'mine' ? '' : tab, county, mine: tab === 'mine' }),
    [token, tab, county],
  )
  const { data, error, loading, reload } = useLoad(load)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState({ key: 'left', dir: 'asc' })
  const compare = sort.key === 'received' ? byReceived : byUrgency
  const q = search.trim().toLowerCase()
  const rows = (data ?? [])
    .filter((r) => matches(r, q))
    .sort((a, b) => (sort.dir === 'asc' ? compare(a, b) : compare(b, a)))
  const paged = usePaged(rows, `${tab}|${county}|${q}|${sort.key}|${sort.dir}`)
  const head = 'px-4 py-2.5'

  return (
    <>
      <PageHeader
        title="Referrals"
        subtitle={isAdmin
          ? 'Every county\'s cases. Officers claim and answer them.'
          : `Cases from ${user.county} the model was not sure about. Claim one before you answer it.`}
      >
        {isAdmin && (
          <select className={filterClass} value={county} onChange={(e) => setCounty(e.target.value)} aria-label="County">
            <option value="">All counties</option>
            {COUNTIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        )}
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs label="Which cases" tabs={isAdmin ? ADMIN_TABS : OFFICER_TABS} value={tab} onChange={setTab} />
        <input className={`${inputClass} sm:max-w-64`} type="search" value={search} onChange={(e) => setSearch(e.target.value)}
               placeholder={isAdmin ? 'Search case, crop or county' : 'Search case or crop'} aria-label="Search referrals" />
      </div>

      <div className="mt-4">
        {loading ? <Loading /> : error ? <ErrorBox error={error} onRetry={reload} /> : rows.length === 0 ? (
          <TableBox>
            {q ? (
              <Empty title="No cases match your search" />
            ) : (
              <Empty title={tab === 'new' ? 'No cases waiting' : 'Nothing here'}>
                New cases arrive when the model is not sure and the farmer agrees to share the photo.
              </Empty>
            )}
          </TableBox>
        ) : (
          <TableBox>
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Referral cases</caption>
              <thead className="border-b border-divider bg-surface/60 text-xs text-muted">
                <tr>
                  <th scope="col" className={head}>Case</th>
                  {isAdmin && <th scope="col" className={head}>County</th>}
                  <SortHeader label="Received" column="received" sort={sort} onSort={setSort} className={head} />
                  <th scope="col" className={head}>From the farmer</th>
                  <SortHeader label="Time left" column="left" sort={sort} onSort={setSort} className={head} />
                  <th scope="col" className={head}>Claimed or answered by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {paged.rows.map((r) => (
                  <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/referrals/${r.id}`)}>
                    <td className="px-4 py-3">
                      <Link to={`/referrals/${r.id}`} className="font-semibold text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                        {CROPS[r.crop]}
                      </Link>
                      <span className="block text-xs text-muted">Case #{r.id}</span>
                    </td>
                    {isAdmin && <td className="px-4 py-3">{r.county}</td>}
                    <td className="whitespace-nowrap px-4 py-3 text-muted">{timeAgo(r.created_at)}</td>
                    <td className="px-4 py-3 text-muted">{r.symptoms_text ? 'Photo and description' : 'Photo only'}</td>
                    <td className="px-4 py-3"><State referral={r} /></td>
                    <td className="px-4 py-3"><Who referral={r} meId={user.id} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination paged={paged} />
          </TableBox>
        )}
      </div>
      {!isAdmin && (
        <p className="mt-3 text-xs text-muted">The model's guess is not shown here. You see it on the case after you give your own diagnosis.</p>
      )}
    </>
  )
}
