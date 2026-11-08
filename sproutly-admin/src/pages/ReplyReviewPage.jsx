import { useCallback, useState } from 'react'
import { Link } from 'react-router'

import { listReplyReview } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Badge, Card, Empty, ErrorBox, Loading, PageHeader, Pagination, filterClass } from '../components/ui.jsx'
import { CROPS, diseaseName, formatDate, judgementName } from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'
import { usePaged } from '../lib/usePaged.js'

// The officer's judgement against the model's first guess (the Overview page's rule).
const AGREEMENT = {
  agreed: ['Agreed', 'active'],
  differed: ['Differed', 'attention'],
  unsure: ['Officer unsure', 'neutral'],
}
const REASONS = {
  not_answered: "didn't answer the question",
  did_not_work: "advice didn't work",
  other: 'something else',
}

function Rating({ row }) {
  if (!row.farmer_rating) return <span className="text-muted">Not rated</span>
  if (row.farmer_rating === 'helpful') return <Badge tone="active">Helpful</Badge>
  return (
    <span>
      <Badge tone="attention">Not helpful</Badge>
      <span className="mt-1 block text-xs text-muted">
        {REASONS[row.feedback_reason] ?? ''}{row.feedback_note ? `: "${row.feedback_note}"` : ''}
      </span>
    </span>
  )
}

/**
 * Officer replies (PR C, decided 5 Nov): admins review answered cases, read only. The model's
 * first guess next to the officer's judgement, the reply and the farmer's rating. No farmer
 * name, phone or photo, and no way to reply here. Report agreement on referred cases, never
 * as the model's accuracy: these are the cases the model was not sure about.
 */
export default function ReplyReviewPage() {
  const { token } = useAuth()
  const load = useCallback(() => listReplyReview(token), [token])
  const { data, error, loading, reload } = useLoad(load)
  const [onlyDiffered, setOnlyDiffered] = useState(false)
  const [rating, setRating] = useState('')

  const rows = data ?? []
  const shown = rows
    .filter((r) => !onlyDiffered || r.agreement === 'differed')
    .filter((r) => !rating || (rating === 'none' ? !r.farmer_rating : r.farmer_rating === rating))
  const paged = usePaged(shown, `${onlyDiffered}|${rating}`)

  const count = (key, value) => rows.filter((r) => r[key] === value).length
  const judged = count('agreement', 'agreed') + count('agreement', 'differed')
  const pct = judged ? Math.round((100 * count('agreement', 'agreed')) / judged) : null

  return (
    <>
      <PageHeader
        title="Officer replies"
        subtitle="Answered cases, read only: the model's first guess next to the officer's judgement, and whether the farmer found the reply helpful."
      />

      {data && rows.length > 0 && (
        <p className="mb-4 text-sm text-body">
          {rows.length} answered · officers agreed with the model on {count('agreement', 'agreed')} of {judged} they
          judged{pct !== null ? ` (${pct}%)` : ''}, differed on {count('agreement', 'differed')}, unsure on{' '}
          {count('agreement', 'unsure')} · farmers rated {count('farmer_rating', 'helpful')} helpful and{' '}
          {count('farmer_rating', 'not_helpful')} not helpful.
          <span className="block text-xs text-muted">
            Agreement on cases the model referred, not the model's accuracy.
          </span>
        </p>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={onlyDiffered} onChange={(e) => setOnlyDiffered(e.target.checked)} />
          Disagreements only
        </label>
        <select className={filterClass} value={rating} onChange={(e) => setRating(e.target.value)} aria-label="Farmer's rating">
          <option value="">Any rating</option>
          <option value="helpful">Helpful</option>
          <option value="not_helpful">Not helpful</option>
          <option value="none">Not rated</option>
        </select>
      </div>

      {loading ? <Loading /> : error ? <ErrorBox error={error} onRetry={reload} /> : shown.length === 0 ? (
        <Card><Empty title={rows.length ? 'No replies match this filter' : 'No answered cases yet'} /></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[880px] text-left text-sm">
            <caption className="sr-only">Answered referral cases</caption>
            <thead className="border-b border-divider bg-surface/60 text-xs text-muted">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-semibold">Case</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Model's first guess</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Officer's judgement</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Reply</th>
                <th scope="col" className="px-5 py-2.5 font-semibold">Farmer</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {paged.rows.map((r) => {
                const [label, tone] = AGREEMENT[r.agreement] ?? [r.agreement, 'neutral']
                return (
                  <tr key={r.id} className="align-top">
                    <td className="px-5 py-3">
                      <Link to={`/referrals/${r.id}`} className="font-semibold text-ink hover:underline">
                        {CROPS[r.crop] ?? r.crop} · #{r.id}
                      </Link>
                      <span className="block text-xs text-muted">{r.county} · replied {formatDate(r.replied_at)}</span>
                      {r.reason === 'doesnt_match' && <span className="block text-xs text-ink">Farmer: diagnosis doesn't match</span>}
                    </td>
                    <td className="px-5 py-3 text-body">{r.model_guess ? diseaseName(r.model_guess) : '-'}</td>
                    <td className="px-5 py-3">
                      <span className="block text-body">{judgementName(r.judgement)}</span>
                      <span className="mt-1 inline-block"><Badge tone={tone}>{label}</Badge></span>
                    </td>
                    <td className="max-w-sm px-5 py-3 text-body">
                      <span className="line-clamp-3">{r.reply_text}</span>
                      <span className="block text-xs text-muted">{r.officer}</span>
                    </td>
                    <td className="px-5 py-3"><Rating row={r} /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <Pagination paged={paged} />
        </Card>
      )}
    </>
  )
}
