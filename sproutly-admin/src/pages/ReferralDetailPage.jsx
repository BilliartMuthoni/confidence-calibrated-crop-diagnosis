import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import {
  claimReferral, getReferral, listAdvice, recordJudgement, referralPhoto, releaseReferral, replyToReferral,
} from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Badge, Button, Card, ErrorBox, Field, Loading, inputClass } from '../components/ui.jsx'
import {
  CROP_PREFIX, CROPS, DISEASES, JUDGEMENTS, REFERRAL_STATUS, daysLeft, diseaseName, formatDate, judgementName, percent,
} from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-[9rem_1fr] gap-3 py-2 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="text-body">{children}</dd>
    </div>
  )
}

function PhotoPlaceholder({ children }) {
  return (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center rounded-xl bg-surface text-faint">
      <svg viewBox="0 0 32 32" className="h-12 w-12" aria-hidden="true">
        <path d="M9 23c0-9 5-14 15-15-1 10-6 15-15 15z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M10 22c3-3 6-7 8-11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <span className="mt-2 text-xs">{children}</span>
    </div>
  )
}

// The farmer's photo. It needs the sign-in token, so it is fetched and shown from memory.
function Photo({ referral }) {
  const { token } = useAuth()
  const [state, setState] = useState({ url: null, failed: false })
  const live = referral.has_photo

  useEffect(() => {
    if (!live) return undefined
    let url = null
    let current = true
    referralPhoto(token, referral.id)
      .then((u) => { url = u; if (current) setState({ url: u, failed: false }) })
      .catch(() => current && setState({ url: null, failed: true }))
    return () => {
      current = false
      if (url) URL.revokeObjectURL(url)
    }
  }, [live, token, referral.id])

  if (!live || state.failed) return <PhotoPlaceholder>The photo is no longer stored (deleted after 30 days)</PhotoPlaceholder>
  if (!state.url) return <PhotoPlaceholder>Loading the photo...</PhotoPlaceholder>
  return <img src={state.url} alt={`The farmer's ${referral.crop} photo`} className="w-full rounded-xl object-contain" />
}

function ModelGuess({ guess }) {
  return (
    <>
      {diseaseName(guess.disease)}, {percent(guess.confidence)} sure (below the threshold, so not shown to the farmer as a
      diagnosis)
    </>
  )
}

// Run an action that returns the updated referral, with its own busy and error state.
function useAction(onDone) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const run = async (action) => {
    setBusy(true)
    setError(null)
    try {
      onDone(await action())
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, run }
}

function ClaimCard({ referral, onChange }) {
  const { token } = useAuth()
  const { busy, error, run } = useAction(onChange)
  return (
    <Card>
      <h2 className="font-bold text-ink">Nobody is reviewing this case yet</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Claim it to answer it. Other officers then see that you have it, so the farmer gets one reply, not two.
      </p>
      <div className="mt-4"><ErrorBox error={error} /></div>
      <Button className="mt-4" variant="expert" busy={busy} onClick={() => run(() => claimReferral(token, referral.id))}>
        Claim this case
      </Button>
    </Card>
  )
}

function ClaimedByOther({ referral, onChange }) {
  const { token, user } = useAuth()
  const { busy, error, run } = useAction(onChange)
  return (
    <Card>
      <h2 className="font-bold text-ink">Being reviewed by {referral.claimed_by.name}</h2>
      <p className="mt-1 text-sm leading-6 text-muted">Claimed {formatDate(referral.claimed_by.at)}.</p>
      {user.role === 'admin' && (
        <>
          <div className="mt-4"><ErrorBox error={error} /></div>
          <Button className="mt-4" variant="secondary" busy={busy} onClick={() => run(() => releaseReferral(token, referral.id))}>
            Release it so another officer can claim it
          </Button>
        </>
      )}
    </Card>
  )
}

function ReplyForm({ referral, onChange }) {
  const { token } = useAuth()
  // Once the backend has the judgement it shows the guess, and the judgement is locked.
  const revealed = Boolean(referral.judgement)
  const [choice, setChoice] = useState(referral.judgement ?? '')
  const judgement = referral.judgement ?? choice
  const [text, setText] = useState('')
  const [adviceIds, setAdviceIds] = useState([])
  const send = useAction(onChange)
  const release = useAction(onChange)
  const reveal = useAction(onChange)
  const loadAdvice = useCallback(() => listAdvice(token), [token])
  const advice = useLoad(loadAdvice)

  const own = Object.keys(DISEASES).filter((cls) => cls.startsWith(CROP_PREFIX[referral.crop]))
  const others = Object.keys(DISEASES).filter((cls) => !own.includes(cls))
  const matching = (advice.data ?? []).filter((a) => a.disease === judgement && a.status === 'active')
  const toggleAdvice = (id) => setAdviceIds(adviceIds.includes(id) ? adviceIds.filter((x) => x !== id) : [...adviceIds, id])
  const pick = (value) => { setChoice(value); setAdviceIds([]) }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="font-bold text-ink">Your reply</h2>
        <button type="button" className="text-sm font-semibold text-muted underline" disabled={release.busy}
                onClick={() => release.run(() => releaseReferral(token, referral.id))}>
          Release this case
        </button>
      </div>
      <ErrorBox error={release.error} />

      <div className="mt-4 space-y-5">
        <Field label="1. What is it, in your judgement?"
               hint="Decide from the photo and the farmer's description first. It is kept as a candidate label for later review, never used to retrain the model automatically.">
          <select className={inputClass} value={judgement} onChange={(e) => pick(e.target.value)} disabled={revealed}>
            <option value="">Choose one</option>
            <optgroup label={CROPS[referral.crop]}>
              {own.map((cls) => <option key={cls} value={cls}>{diseaseName(cls)}</option>)}
            </optgroup>
            <optgroup label="If the photo is another crop">
              {others.map((cls) => <option key={cls} value={cls}>{diseaseName(cls)}</option>)}
            </optgroup>
            <optgroup label="Other answers">
              {Object.entries(JUDGEMENTS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </optgroup>
          </select>
        </Field>

        <div className="rounded-xl bg-surface px-4 py-3 text-sm">
          {revealed && referral.guess ? (
            <p className="text-body"><span className="font-semibold">Model's guess:</span> <ModelGuess guess={referral.guess} /></p>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-muted">
                {judgement ? 'Your judgement is locked once you look.' : 'Give your judgement first, then you can compare.'}
              </span>
              <Button variant="secondary" disabled={!judgement} busy={reveal.busy}
                      onClick={() => reveal.run(() => recordJudgement(token, referral.id, judgement))}>
                Show model's guess
              </Button>
            </div>
          )}
        </div>
        <ErrorBox error={reveal.error} />

        <Field label="2. Your reply to the farmer"
               hint={'The farmer sees it on this check, labelled "Advice from a county officer", with your name and the time.'}>
          <textarea className={`${inputClass} min-h-32`} value={text} onChange={(e) => setText(e.target.value)}
                    placeholder="What you think it is, and what the farmer should do next. If you need to see the crop, say so." />
        </Field>

        {DISEASES[judgement] && !judgement.endsWith('healthy') && (
          <fieldset>
            <legend className="mb-1.5 text-sm font-semibold text-ink">3. Add advice from the library (optional)</legend>
            {matching.length === 0 ? (
              <p className="text-sm text-faint">No advice for {diseaseName(judgement)} in the library yet.</p>
            ) : (
              <ul className="space-y-2">
                {matching.map((a) => (
                  <li key={a.id}>
                    <label className="flex gap-3 rounded-xl border border-divider px-3.5 py-2.5 text-sm">
                      <input type="checkbox" className="mt-1" checked={adviceIds.includes(a.id)} onChange={() => toggleAdvice(a.id)} />
                      <span>
                        <span className="text-body">{a.text}</span>
                        <span className="mt-0.5 block text-xs text-faint">{a.kind} - {a.source_title}</span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>
        )}

        <ErrorBox error={send.error} />
        <Button onClick={() => send.run(() => replyToReferral(token, referral.id, { text: text.trim(), judgement, adviceIds }))}
                busy={send.busy} disabled={!judgement || text.trim().length < 10} variant="expert">
          Send reply
        </Button>
      </div>
    </Card>
  )
}

function SentReply({ referral }) {
  const { token } = useAuth()
  const loadAdvice = useCallback(() => listAdvice(token), [token])
  const advice = useLoad(loadAdvice)
  const attached = (advice.data ?? []).filter((a) => referral.reply.advice_ids?.includes(a.id))
  return (
    <Card>
      <p className="text-xs font-bold uppercase tracking-wider text-expert">Advice from a county officer</p>
      <p className="mt-2 leading-7 text-body">{referral.reply.text}</p>
      {attached.length > 0 && (
        <ul className="mt-3 space-y-2 border-l-2 border-expert/30 pl-3">
          {attached.map((a) => (
            <li key={a.id} className="text-sm text-body">
              {a.text}
              <span className="block text-xs text-faint">Source: {a.source_title} ({a.licence})</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm text-muted">{referral.reply.officer}, {formatDate(referral.reply.replied_at)}</p>
      <p className="mt-3 text-xs text-faint">
        Officer's judgement: {judgementName(referral.reply.judgement)}
        {referral.reply.judgement === referral.guess.disease
          ? ' (agrees with the model)'
          : DISEASES[referral.reply.judgement] || referral.reply.judgement === 'other_disease' ? ' (differs from the model)' : ''}
      </p>
    </Card>
  )
}

export default function ReferralDetailPage() {
  const { id } = useParams()
  const { token, user } = useAuth()
  const load = useCallback(() => getReferral(token, id), [token, id])
  const { data, error, loading, reload } = useLoad(load)
  const [updated, setUpdated] = useState(null)

  // A copy each time, so React redraws even when the API hands back the same object.
  const change = (next) => setUpdated({ ...next })

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} onRetry={reload} />
  const referral = updated ?? data
  const mine = referral.status === 'in_review' && referral.claimed_by?.id === user.id
  const open = referral.status === 'new' || referral.status === 'in_review'
  // The backend sends no guess for open cases until the reviewer's judgement is in.
  const showGuess = referral.guess && (!open || (mine && referral.judgement))

  return (
    <>
      <Link to="/referrals" className="text-sm font-semibold text-primary underline">Back to referrals</Link>
      <div className="mb-6 mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold text-ink">{CROPS[referral.crop]} case from {referral.county}</h1>
        <Badge tone={referral.status}>{REFERRAL_STATUS[referral.status]}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <Card>
          <Photo referral={referral} />
          <dl className="mt-4 divide-y divide-divider">
            <Row label="Received">{formatDate(referral.created_at)}</Row>
            <Row label="Farmer">{referral.farmer}</Row>
            <Row label="Photo shared">{referral.consent ? 'Yes, the farmer agreed to share it with an officer' : 'No'}</Row>
            <Row label="Contact">
              {referral.contact_consent
                ? <>{referral.farmer_phone} <span className="text-faint">(the farmer agreed to be called)</span></>
                : <span className="text-faint">The farmer did not agree to be called. Reply here; they see it in the app.</span>}
            </Row>
            <Row label="Farmer's description">{referral.symptoms_text ?? <span className="text-faint">None given</span>}</Row>
            {referral.crop_mismatch && (
              <Row label="Note"><span className="text-attention">The photo may not be {referral.crop.toLowerCase()}: the model thought it looked more like another crop.</span></Row>
            )}
            <Row label="Model's guess">
              {showGuess ? <ModelGuess guess={referral.guess} /> : <span className="text-faint">Hidden until you have given your judgement</span>}
            </Row>
            {open && (
              <Row label="Time left">{daysLeft(referral.expires_at)} days. After 7 days the farmer is shown the county contacts instead.</Row>
            )}
          </dl>
        </Card>

        <div className="space-y-6">
          {referral.status === 'new' && <ClaimCard referral={referral} onChange={change} />}
          {referral.status === 'in_review' && !mine && <ClaimedByOther referral={referral} onChange={change} />}
          {mine && <ReplyForm key={referral.claimed_by.at} referral={referral} onChange={change} />}
          {referral.reply && <SentReply referral={referral} />}
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
