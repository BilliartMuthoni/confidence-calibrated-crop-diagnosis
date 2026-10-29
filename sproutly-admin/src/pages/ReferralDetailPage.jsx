import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'

import {
  claimReferral, getReferral, listAdvice, recordJudgement, referralPhoto, releaseReferral, replyToReferral,
} from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Badge, Button, ErrorBox, Loading, inputClass } from '../components/ui.jsx'
import {
  CROP_PREFIX, CROPS, DISEASES, JUDGEMENTS, diseaseName, formatDate, judgementName, percent, timeLeft,
} from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'

function Row({ label, children }) {
  return (
    <div className="grid gap-1 py-2.5 text-sm sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-muted">{label}</dt>
      <dd className="text-body">{children}</dd>
    </div>
  )
}

function PhotoPlaceholder({ children }) {
  return (
    <div className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 rounded-lg bg-[#dfe7e0] text-[#46624f]">
      <svg viewBox="0 0 32 32" className="h-12 w-12" aria-hidden="true">
        <path d="M9 23c0-9 5-14 15-15-1 10-6 15-15 15z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="M10 22c3-3 6-7 8-11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="text-sm">{children}</span>
    </div>
  )
}

// The farmer's photo. It needs the sign-in token, so it is fetched and shown from memory;
// clicking it opens it full size in a new tab for a closer look.
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
  if (!state.url) return <PhotoPlaceholder>Loading the photo</PhotoPlaceholder>
  return (
    <a href={state.url} target="_blank" rel="noreferrer" title="Open full size" className="block">
      <img src={state.url} alt={`The farmer's ${referral.crop} photo`} className="max-h-[32rem] w-full rounded-lg bg-[#dfe7e0] object-contain" />
    </a>
  )
}

function ModelGuess({ guess }) {
  return (
    <>
      {diseaseName(guess.disease)}, <span className="tabular-nums">{percent(guess.confidence)}</span> sure. Below the
      threshold, so the farmer was not shown it.
      {guess.model_version && <span className="mt-1 block text-xs text-muted">Model: {guess.model_version}</span>}
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

function Panel({ children }) {
  return <section className="space-y-6 rounded-lg border border-divider bg-white p-5 sm:p-6">{children}</section>
}

function Step({ number, title, children }) {
  return (
    <div className="space-y-2.5">
      <h2 className="flex items-baseline gap-2.5 text-base font-semibold text-ink">
        <span className="tabular-nums text-muted">{number}</span>{title}
      </h2>
      {children}
    </div>
  )
}

function ClaimCard({ referral, onChange }) {
  const { token } = useAuth()
  const { busy, error, run } = useAction(onChange)
  return (
    <Panel>
      <div>
        <h2 className="text-base font-semibold text-ink">Nobody has claimed this case</h2>
        <p className="mt-1 text-sm text-muted">Claim it to answer it. Other officers then see it is yours.</p>
      </div>
      <ErrorBox error={error} />
      <Button busy={busy} onClick={() => run(() => claimReferral(token, referral.id))}>Claim this case</Button>
    </Panel>
  )
}

function ClaimedByOther({ referral, onChange }) {
  const { token, user } = useAuth()
  const { busy, error, run } = useAction(onChange)
  return (
    <Panel>
      <div>
        <h2 className="text-base font-semibold text-ink">{referral.claimed_by.name} is answering this case</h2>
        <p className="mt-1 text-sm text-muted">Claimed {formatDate(referral.claimed_by.at)}.</p>
      </div>
      {user.role === 'admin' && (
        <>
          <ErrorBox error={error} />
          <Button variant="secondary" busy={busy} onClick={() => run(() => releaseReferral(token, referral.id))}>
            Release it for another officer
          </Button>
        </>
      )}
    </Panel>
  )
}

function Choice({ value, label, checked, disabled, onPick }) {
  return (
    <label className={`flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm ${
      checked ? 'border-primary bg-healthy-tint/60 text-ink' : 'border-divider bg-white hover:border-divider-strong'
    } ${disabled ? 'cursor-default opacity-60' : ''}`}>
      <input type="radio" name="judgement" value={value} checked={checked} disabled={disabled}
             onChange={() => onPick(value)} className="accent-primary" />
      {label}
    </label>
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
    <Panel>
      <Step number="1" title="Your diagnosis">
        {revealed ? (
          <p className="flex items-center gap-2.5 text-sm">
            <span className="font-semibold text-ink">{judgementName(judgement)}</span><Badge>Saved</Badge>
          </p>
        ) : (
          <>
            <p className="text-sm text-muted">Decide from the photo and the description. It locks when you save it.</p>
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="sr-only">Your diagnosis</legend>
              {own.map((cls) => (
                <Choice key={cls} value={cls} label={diseaseName(cls)} checked={judgement === cls} onPick={pick} />
              ))}
              {Object.entries(JUDGEMENTS).map(([value, label]) => (
                <Choice key={value} value={value} label={label} checked={judgement === value} onPick={pick} />
              ))}
            </fieldset>
            <label className="block text-sm">
              <span className="text-muted">If the photo is another crop</span>
              <select className={`${inputClass} mt-1`} value={others.includes(judgement) ? judgement : ''}
                      onChange={(e) => e.target.value && pick(e.target.value)}>
                <option value="">Choose a disease of another crop</option>
                {others.map((cls) => <option key={cls} value={cls}>{diseaseName(cls)}</option>)}
              </select>
            </label>
            <ErrorBox error={reveal.error} />
            <Button disabled={!judgement} busy={reveal.busy}
                    onClick={() => reveal.run(() => recordJudgement(token, referral.id, judgement))}>
              Save diagnosis
            </Button>
          </>
        )}
      </Step>

      <Step number="2" title="Model's guess">
        {revealed && referral.guess ? (
          <>
            <p className="text-sm text-body"><ModelGuess guess={referral.guess} /></p>
            {DISEASES[judgement] && (
              <Badge tone={judgement === referral.guess.disease ? 'active' : 'attention'}>
                {judgement === referral.guess.disease ? 'Same as your diagnosis' : 'Different from your diagnosis'}
              </Badge>
            )}
          </>
        ) : (
          <p className="text-sm text-muted">Shown after you save your diagnosis, so it does not sway you.</p>
        )}
      </Step>

      <Step number="3" title="Reply to the farmer">
        <label htmlFor="reply" className="block text-sm text-muted">
          They see it on this check as advice from a county officer, with your name.
        </label>
        <textarea id="reply" className={`${inputClass} min-h-32`} value={text} onChange={(e) => setText(e.target.value)}
                  disabled={!revealed} placeholder="What it is and what they should do next. If you need to see the crop, say so." />
      </Step>

      {DISEASES[judgement] && !judgement.endsWith('healthy') && (
        <Step number="4" title={<>Attach advice <span className="text-sm font-normal text-muted">(optional)</span></>}>
          {matching.length === 0 ? (
            <p className="text-sm text-muted">No advice for {diseaseName(judgement)} in the library yet.</p>
          ) : (
            <ul className="space-y-2">
              {matching.map((a) => (
                <li key={a.id}>
                  <label className="flex gap-3 rounded-md border border-divider px-3 py-2.5 text-sm">
                    <input type="checkbox" className="mt-0.5 accent-primary" checked={adviceIds.includes(a.id)}
                           onChange={() => toggleAdvice(a.id)} disabled={!revealed} />
                    <span>
                      <span className="text-body">{a.text}</span>
                      <span className="mt-0.5 block text-xs text-muted">{a.kind === 'treatment' ? 'Treatment' : 'Prevention'}. {a.source_title}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Step>
      )}

      <div className="space-y-3 border-t border-divider pt-5">
        <ErrorBox error={send.error} />
        <ErrorBox error={release.error} />
        <div className="flex flex-wrap items-center gap-4">
          <Button onClick={() => send.run(() => replyToReferral(token, referral.id, { text: text.trim(), judgement, adviceIds }))}
                  busy={send.busy} disabled={!revealed || text.trim().length < 10}>
            Send reply
          </Button>
          <button type="button" className="text-sm font-semibold text-primary underline" disabled={release.busy}
                  onClick={() => release.run(() => releaseReferral(token, referral.id))}>
            Release case
          </button>
        </div>
      </div>
    </Panel>
  )
}

function SentReply({ referral }) {
  const { token } = useAuth()
  const loadAdvice = useCallback(() => listAdvice(token), [token])
  const advice = useLoad(loadAdvice)
  const attached = (advice.data ?? []).filter((a) => referral.reply.advice_ids?.includes(a.id))
  const differs = DISEASES[referral.reply.judgement] || referral.reply.judgement === 'other_disease'
  return (
    <Panel>
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-ink">Reply sent</h2>
        <p className="text-sm leading-6 text-body">{referral.reply.text}</p>
        {attached.length > 0 && (
          <ul className="space-y-2 border-l-2 border-divider pl-3">
            {attached.map((a) => (
              <li key={a.id} className="text-sm text-body">
                {a.text}
                <span className="block text-xs text-muted">{a.source_title} ({a.licence})</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-muted">{referral.reply.officer}, {formatDate(referral.reply.replied_at)}</p>
      </div>
      <p className="border-t border-divider pt-4 text-sm text-muted">
        Officer's diagnosis: <span className="text-body">{judgementName(referral.reply.judgement)}</span>
        {referral.reply.judgement === referral.guess.disease ? ', the same as the model.' : differs ? ', different from the model.' : '.'}
      </p>
    </Panel>
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
  const left = timeLeft(referral.expires_at)

  return (
    <>
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
        <Link to="/referrals" className="font-semibold text-primary hover:underline">Referrals</Link>
        <span className="text-muted" aria-hidden="true">/</span>
        <span className="text-muted">Case #{referral.id}</span>
      </nav>
      <div className="mb-6 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold text-ink">{CROPS[referral.crop]} case from {referral.county}</h1>
        {referral.status === 'answered' && <Badge tone="answered">Answered</Badge>}
        {referral.status === 'expired' && <Badge tone="expired">Expired</Badge>}
        {referral.status === 'in_review' && <Badge>{mine ? 'Claimed by you' : 'In review'}</Badge>}
        {open && <Badge tone={left.urgent ? 'urgent' : 'neutral'}>{left.text}</Badge>}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-label="What the farmer sent">
          <Photo referral={referral} />
          <dl className="mt-4 divide-y divide-divider">
            <Row label="Received">{formatDate(referral.created_at)}</Row>
            <Row label="Farmer">{referral.farmer}</Row>
            <Row label="What they described">{referral.symptoms_text ?? <span className="text-muted">Nothing written</span>}</Row>
            <Row label="Phone">
              {referral.contact_consent
                ? <>{referral.farmer_phone} <span className="text-muted">(agreed to be called)</span></>
                : <span className="text-muted">Did not agree to be called. Reply here; they see it in the app.</span>}
            </Row>
            {referral.crop_mismatch && (
              <Row label="Note"><span className="text-attention-ink">The photo may not be {referral.crop}: the model thought it looked more like another crop.</span></Row>
            )}
            <Row label="Model's guess">
              {showGuess ? <ModelGuess guess={referral.guess} /> : <span className="text-muted">Hidden until you save your diagnosis</span>}
            </Row>
          </dl>
        </section>

        <div className="space-y-6">
          {referral.status === 'new' && (user.role === 'officer' ? <ClaimCard referral={referral} onChange={change} /> : (
            // Admins oversee the queue; only extension officers claim and answer cases.
            <Panel>
              <div>
                <h2 className="text-base font-semibold text-ink">Waiting for an officer{referral.county ? ` in ${referral.county}` : ''}</h2>
                <p className="mt-1 text-sm text-muted">
                  Only officers answer cases. If the county has none, add one under Users; otherwise the farmer is shown the
                  county contacts after 7 days.
                </p>
              </div>
            </Panel>
          ))}
          {referral.status === 'in_review' && !mine && <ClaimedByOther referral={referral} onChange={change} />}
          {mine && <ReplyForm key={referral.claimed_by.at} referral={referral} onChange={change} />}
          {referral.reply && <SentReply referral={referral} />}
          {referral.status === 'expired' && (
            <Panel>
              <p className="text-sm text-muted">
                No officer replied within 7 days, so the farmer was shown the county contacts. The photo is deleted 30 days
                after the case arrived.
              </p>
            </Panel>
          )}
        </div>
      </div>
    </>
  )
}
