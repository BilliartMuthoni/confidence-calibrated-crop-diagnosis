import { useCallback, useState } from 'react'
import { Link, useParams } from 'react-router'

import { getReferral, replyToReferral } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Badge, Button, Card, ErrorBox, Field, Loading, inputClass } from '../components/ui.jsx'
import { CROPS, DISEASES, daysLeft, diseaseName, formatDate, percent } from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'

const CROP_PREFIX = { maize: 'Corn_(maize)___', tomato: 'Tomato___', potato: 'Potato___' }

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-body">{children}</dd>
    </div>
  )
}

function PhotoPlaceholder({ crop }) {
  return (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-xl bg-surface text-faint">
      <svg viewBox="0 0 32 32" className="h-12 w-12" aria-hidden="true">
        <path d="M9 23c0-9 5-14 15-15-1 10-6 15-15 15z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M10 22c3-3 6-7 8-11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="mt-2 text-xs">Sample: the farmer's {crop} photo appears here</span>
    </div>
  )
}

function ReplyForm({ referral, onSent }) {
  const { token } = useAuth()
  const [text, setText] = useState('')
  const [correct, setCorrect] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const options = Object.keys(DISEASES).filter((cls) => cls.startsWith(CROP_PREFIX[referral.crop]))

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      onSent(await replyToReferral(token, referral.id, { text: text.trim(), correctDisease: correct }))
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <h2 className="font-bold text-ink">Reply to the farmer</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        The farmer sees your reply on this check in their history, labelled "Advice from a county officer", with your
        name and the time. Use advice you would give in person; if you need to see the crop, say so.
      </p>
      <div className="mt-4 space-y-4">
        <Field label="Your reply">
          <textarea className={`${inputClass} min-h-32`} value={text} onChange={(e) => setText(e.target.value)}
                    placeholder="What you think it is, and what the farmer should do next." />
        </Field>
        <Field label="What is it, in your judgement? (optional)"
               hint="Recorded as a candidate label for later review only. It is never used to retrain the model automatically.">
          <select className={inputClass} value={correct} onChange={(e) => setCorrect(e.target.value)}>
            <option value="">Not sure / prefer not to say</option>
            {options.map((cls) => <option key={cls} value={cls}>{diseaseName(cls)}</option>)}
            <option value="other">Something else (not one of Sproutly's diseases)</option>
          </select>
        </Field>
        <ErrorBox error={error} />
        <Button onClick={send} busy={busy} disabled={text.trim().length < 10} variant="expert">
          Send reply
        </Button>
      </div>
    </Card>
  )
}

export default function ReferralDetailPage() {
  const { id } = useParams()
  const { token } = useAuth()
  const load = useCallback(() => getReferral(token, id), [token, id])
  const { data, error, loading, reload } = useLoad(load)
  const [sent, setSent] = useState(null)

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const referral = sent ?? data

  return (
    <>
      <Link to="/referrals" className="text-sm font-semibold text-primary underline">Back to referrals</Link>
      <div className="mb-6 mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink">{CROPS[referral.crop]} case from {referral.county}</h1>
        <Badge tone={referral.status}>{referral.status}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card>
          <PhotoPlaceholder crop={referral.crop.toLowerCase()} />
          <dl className="mt-4 divide-y divide-divider">
            <Row label="Received">{formatDate(referral.created_at)}</Row>
            <Row label="Farmer">{referral.farmer}</Row>
            <Row label="Photo shared">{referral.consent ? 'Yes, the farmer agreed to share it with an officer' : 'No'}</Row>
            <Row label="Model's best guess">
              {diseaseName(referral.guess.disease)}, {percent(referral.guess.confidence)} sure (below the threshold, so
              not shown to the farmer as a diagnosis)
            </Row>
            {referral.crop_mismatch && (
              <Row label="Note"><span className="text-attention">The photo may not be {referral.crop.toLowerCase()}: most of the model's confidence went to another crop.</span></Row>
            )}
            <Row label="Farmer's description">{referral.symptoms_text ?? <span className="text-faint">None given</span>}</Row>
            {referral.status === 'waiting' && (
              <Row label="Time left">{daysLeft(referral.expires_at)} days. After 7 days the farmer is shown the county contacts instead.</Row>
            )}
          </dl>
        </Card>

        <div className="space-y-6">
          {referral.status === 'waiting' && <ReplyForm referral={referral} onSent={setSent} />}
          {referral.reply && (
            <Card>
              <p className="text-xs font-bold uppercase tracking-wider text-expert">Advice from a county officer</p>
              <p className="mt-2 leading-7 text-body">{referral.reply.text}</p>
              <p className="mt-3 text-sm text-muted">
                {referral.reply.officer}, {formatDate(referral.reply.replied_at)}
              </p>
              {referral.reply.correct_disease && (
                <p className="mt-3 text-xs text-faint">
                  Candidate label recorded: {referral.reply.correct_disease === 'other' ? 'something else' : diseaseName(referral.reply.correct_disease)}
                </p>
              )}
            </Card>
          )}
          {referral.status === 'expired' && (
            <Card>
              <p className="text-sm leading-6 text-muted">
                No officer replied within 7 days, so the farmer was shown the county contacts. The photo is deleted 30
                days after the case was received.
              </p>
            </Card>
          )}
        </div>
      </div>
    </>
  )
}
