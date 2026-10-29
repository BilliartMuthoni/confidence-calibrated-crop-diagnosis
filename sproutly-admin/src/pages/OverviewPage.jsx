import { useCallback } from 'react'
import { Link, useNavigate } from 'react-router'

import { getOverview, listReferrals } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Badge, BarList, ErrorBox, Loading, PageHeader, TableBox } from '../components/ui.jsx'
import { CROPS, diseaseName, parseUtc, percent, timeAgo, timeLeft } from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'

// One strip of numbers, divided by lines rather than boxed one by one.
function Stat({ label, value, note, to, urgent = false }) {
  const body = (
    <>
      <span className="block text-sm text-muted">{label}</span>
      <span className="mt-1 block text-[28px] font-bold leading-9 tabular-nums text-ink">{value}</span>
      {note && (urgent ? <Badge tone="attention">{note}</Badge> : <span className="block text-xs text-muted">{note}</span>)}
    </>
  )
  const cls = 'block px-5 py-4'
  return to ? <Link to={to} className={`${cls} hover:bg-surface`}>{body}</Link> : <div className={cls}>{body}</div>
}

function Panel({ title, aside, children, className = '' }) {
  return (
    <section className={`rounded-lg border border-divider bg-white ${className}`}>
      <div className="flex items-center justify-between gap-3 border-b border-divider px-5 py-3">
        <h2 className="text-base font-semibold text-ink">{title}</h2>
        {aside}
      </div>
      <div className="px-5 py-4">{children}</div>
    </section>
  )
}

/** FR x: how confident the model was on the cases it referred, in bins of 0.1. */
function ReferredConfidence({ bins }) {
  const max = Math.max(1, ...bins.map(([, count]) => count))
  return (
    <div>
      <div className="flex h-40 items-end gap-1.5 border-b border-divider-strong">
        {bins.map(([low, count]) => (
          <div key={low} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${percent(low)}-${percent(low + 0.1)}: ${count} cases`}>
            <span className="text-xs tabular-nums text-muted">{count}</span>
            <span className="w-full max-w-10 rounded-t bg-primary hover:bg-forest-light" style={{ height: `${(count / max) * 120}px` }} />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        {bins.map(([low]) => (
          <span key={low} className="flex-1 text-center text-xs tabular-nums text-muted">{percent(low)}</span>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        Model confidence on each referred case, by 10% band. Cases near the threshold are the ones a better model would most
        likely have answered.
      </p>
    </div>
  )
}

/** The open cases closest to expiring, across all counties. */
function NeedsAttention() {
  const { token } = useAuth()
  const navigate = useNavigate()
  const load = useCallback(() => listReferrals(token, { status: '', county: '', mine: false }), [token])
  const { data, error, loading, reload } = useLoad(load)
  if (loading) return <Loading rows={3} />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const open = (data ?? [])
    .filter((r) => r.status === 'new' || r.status === 'in_review')
    .sort((a, b) => parseUtc(a.expires_at) - parseUtc(b.expires_at))
    .slice(0, 5)

  return (
    <TableBox>
      <div className="flex items-center justify-between gap-3 border-b border-divider px-5 py-3">
        <h2 className="text-base font-semibold text-ink">Needs attention</h2>
        <Link to="/referrals" className="text-sm font-semibold text-primary hover:underline">All referrals</Link>
      </div>
      {open.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">No cases are waiting for an officer.</p>
      ) : (
        <table className="w-full min-w-[620px] text-sm">
          <caption className="sr-only">Open cases with the least time left</caption>
          <thead className="border-b border-divider bg-surface/60 text-xs text-muted">
            <tr>
              <th scope="col" className="px-5 py-2.5">Case</th>
              <th scope="col" className="px-5 py-2.5">County</th>
              <th scope="col" className="px-5 py-2.5">Received</th>
              <th scope="col" className="px-5 py-2.5">Time left</th>
              <th scope="col" className="px-5 py-2.5">Claimed by</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {open.map((r) => {
              const left = timeLeft(r.expires_at)
              return (
                <tr key={r.id} className="cursor-pointer" onClick={() => navigate(`/referrals/${r.id}`)}>
                  <td className="px-5 py-2.5">
                    <Link to={`/referrals/${r.id}`} className="font-semibold text-ink hover:underline" onClick={(e) => e.stopPropagation()}>
                      {CROPS[r.crop]} #{r.id}
                    </Link>
                  </td>
                  <td className="px-5 py-2.5">{r.county}</td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-muted">{timeAgo(r.created_at)}</td>
                  <td className="px-5 py-2.5"><Badge tone={left.urgent ? 'urgent' : 'neutral'}>{left.text}</Badge></td>
                  <td className="px-5 py-2.5">{r.claimed_by ? r.claimed_by.name : <span className="text-muted">Not claimed</span>}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </TableBox>
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
      <PageHeader title="Overview" subtitle="This week, and where farmers are waiting for an officer." />

      <section aria-label="This week in numbers"
               className="grid divide-divider overflow-hidden rounded-lg border border-divider bg-white sm:grid-cols-2 sm:divide-x lg:grid-cols-5 max-sm:divide-y">
        <Stat label="Checks this week" value={data.checks_this_week} />
        <Stat label="Sent to an officer" value={percent(data.referred_this_week / data.checks_this_week)}
              note={`${data.referred_this_week} of ${data.checks_this_week} checks`} />
        <Stat label="Waiting for an officer" value={data.waiting_referrals} to="/referrals"
              note={data.expiring_soon ? `${data.expiring_soon} expire within 2 days` : 'None expire within 2 days'}
              urgent={data.expiring_soon > 0} />
        <Stat label="Answered within 7 days" value={percent(data.answered_within_7_days)}
              note="Others go to the county contacts" />
        <Stat label="Officers agree with the model" value={percent(data.officer_agreement.agreed / data.officer_agreement.judged)}
              note={`${data.officer_agreement.agreed} of ${data.officer_agreement.judged} answered cases`} />
      </section>

      <div className="mt-6"><NeedsAttention /></div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Panel title="Most common results">
          <BarList rows={data.top_results.map(([cls, count]) => [diseaseName(cls), count])} />
        </Panel>
        <Panel title="Checks by county">
          <BarList rows={data.by_county} />
        </Panel>
        <Panel title="How sure the model was on referred cases" className="lg:col-span-2">
          <ReferredConfidence bins={data.referred_confidence} />
        </Panel>
      </div>
    </>
  )
}
