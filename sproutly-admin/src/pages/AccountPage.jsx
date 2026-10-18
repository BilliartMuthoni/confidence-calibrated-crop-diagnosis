import { useCallback, useState } from 'react'

import { changePassword, confirmAuthenticatorReset, getMyAccount, makeBackupCodes, startAuthenticatorReset } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Button, Card, ErrorBox, Field, Loading, PageHeader, inputClass } from '../components/ui.jsx'
import { AUDIT_ACTIONS, formatDate } from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'

const MIN_PASSWORD = 12

// Busy and error state for one form; returns true when the action worked.
function useSubmit() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const submit = async (action) => {
    setBusy(true)
    setError(null)
    try {
      await action()
      return true
    } catch (e) {
      setError(e)
      return false
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, submit }
}

function CodeInput({ value, onChange, label = 'Code from your authenticator app' }) {
  return (
    <Field label={label}>
      <input className={`${inputClass.replace('w-full', 'w-40')} tracking-[0.3em]`} inputMode="numeric" autoComplete="one-time-code" maxLength={6}
             value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ''))} />
    </Field>
  )
}

function PasswordCard() {
  const { token } = useAuth()
  const [form, setForm] = useState({ current: '', next: '', again: '' })
  const [done, setDone] = useState(false)
  const { busy, error, submit } = useSubmit()
  const set = (key) => (e) => { setForm({ ...form, [key]: e.target.value }); setDone(false) }
  const tooShort = form.next.length > 0 && form.next.length < MIN_PASSWORD
  const mismatch = form.again.length > 0 && form.again !== form.next

  const save = async () => {
    if (await submit(() => changePassword(token, form.current, form.next))) {
      setForm({ current: '', next: '', again: '' })
      setDone(true)
    }
  }

  return (
    <Card>
      <h2 className="font-bold text-ink">Password</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Current password">
          <input className={inputClass} type="password" autoComplete="current-password" value={form.current} onChange={set('current')} />
        </Field>
        <Field label="New password" hint={tooShort ? `At least ${MIN_PASSWORD} characters.` : `${MIN_PASSWORD} characters or more. A short sentence is easy to remember.`}>
          <input className={inputClass} type="password" autoComplete="new-password" value={form.next} onChange={set('next')} />
        </Field>
        <Field label="New password again" hint={mismatch ? 'The two new passwords are different.' : null}>
          <input className={inputClass} type="password" autoComplete="new-password" value={form.again} onChange={set('again')} />
        </Field>
      </div>
      <div className="mt-4"><ErrorBox error={error} /></div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button busy={busy} onClick={save}
                disabled={!form.current || form.next.length < MIN_PASSWORD || form.next !== form.again}>
          Change password
        </Button>
        {done && <span className="text-sm font-semibold text-healthy">Password changed.</span>}
      </div>
    </Card>
  )
}

// Moving to a new phone: a code from the old one (or a backup code), then the new key.
function AuthenticatorCard() {
  const { token } = useAuth()
  const [code, setCode] = useState('')
  const [setup, setSetup] = useState(null)
  const [newCode, setNewCode] = useState('')
  const [done, setDone] = useState(false)
  const { busy, error, submit } = useSubmit()

  const start = async () => {
    let result
    if (await submit(async () => { result = await startAuthenticatorReset(token, code) })) {
      setSetup(result)
      setCode('')
    }
  }
  const confirm = async () => {
    if (await submit(() => confirmAuthenticatorReset(token, setup.setup_token, newCode))) {
      setSetup(null)
      setNewCode('')
      setDone(true)
    }
  }

  return (
    <Card>
      <h2 className="font-bold text-ink">Authenticator app</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Got a new phone? Move your sign-in codes to it here while you still have the old one. If the old phone is lost,
        sign in with a backup code, or ask an administrator to reset your authenticator.
      </p>
      {!setup ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <CodeInput value={code} onChange={setCode} label="Code from your current app" />
          <Button variant="secondary" busy={busy} disabled={code.length !== 6} onClick={start}>Set up on a new phone</Button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="inline-block rounded-xl border border-divider bg-white p-3">
            {setup.qr_code
              ? <img src={setup.qr_code} alt="QR code for your authenticator app" className="h-32 w-32" />
              : <p className="text-sm text-muted">Setup key: <code className="font-semibold text-ink">{setup.secret}</code></p>}
          </div>
          <p className="text-sm text-muted">Scan this with the app on your new phone, then type the code it shows. Your old phone stops working once you confirm.</p>
          <div className="flex flex-wrap items-end gap-3">
            <CodeInput value={newCode} onChange={setNewCode} label="Code from your new phone" />
            <Button busy={busy} disabled={newCode.length !== 6} onClick={confirm}>Confirm</Button>
            <Button variant="secondary" onClick={() => setSetup(null)}>Cancel</Button>
          </div>
        </div>
      )}
      <div className="mt-4"><ErrorBox error={error} /></div>
      {done && <p className="mt-2 text-sm font-semibold text-healthy">Your new phone is set up.</p>}
    </Card>
  )
}

function BackupCodesCard({ left, onChange }) {
  const { token } = useAuth()
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState(null)
  const { busy, error, submit } = useSubmit()

  const make = async () => {
    let result
    if (await submit(async () => { result = await makeBackupCodes(token, code) })) {
      setCodes(result.codes)
      setCode('')
      onChange()
    }
  }

  return (
    <Card>
      <h2 className="font-bold text-ink">Backup codes</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Each code signs you in once if you lose your phone. You have <span className="font-semibold text-ink">{left}</span> unused.
        Making new codes cancels all the old ones.
      </p>
      {codes ? (
        <div className="mt-4">
          <p className="text-sm font-semibold text-attention">Write these down or print them now. They are not shown again.</p>
          <ul className="mt-3 grid max-w-md grid-cols-2 gap-2 font-mono text-sm text-ink">
            {codes.map((c) => <li key={c} className="rounded-lg bg-surface px-3 py-1.5">{c}</li>)}
          </ul>
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={() => navigator.clipboard?.writeText(codes.join('\n'))}>Copy</Button>
            <Button variant="secondary" onClick={() => setCodes(null)}>I have saved them</Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <CodeInput value={code} onChange={setCode} />
          <Button variant="secondary" busy={busy} disabled={code.length !== 6} onClick={make}>Make new backup codes</Button>
        </div>
      )}
      <div className="mt-4"><ErrorBox error={error} /></div>
    </Card>
  )
}

export default function AccountPage() {
  const { token, user } = useAuth()
  const load = useCallback(() => getMyAccount(token), [token])
  const { data, error, loading, reload } = useLoad(load)

  return (
    <>
      <PageHeader title="My account" subtitle="Your sign-in details. Every change here is recorded in the audit log." />

      <div className="space-y-6">
        <Card>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div><dt className="text-muted">Name</dt><dd className="mt-0.5 text-ink">{user.name}</dd></div>
            <div><dt className="text-muted">Email</dt><dd className="mt-0.5 text-ink">{user.email}</dd></div>
            <div>
              <dt className="text-muted">Role</dt>
              <dd className="mt-0.5 text-ink">{user.role === 'admin' ? 'Administrator' : `Extension officer, ${user.county}`}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-faint">To change your name, email or county, ask an administrator.</p>
        </Card>

        <PasswordCard />
        <AuthenticatorCard />
        {loading ? <Loading /> : error ? <ErrorBox error={error} onRetry={reload} /> : (
          <>
            <BackupCodesCard left={data.backup_codes_left} onChange={reload} />
            <Card>
              <h2 className="font-bold text-ink">Recent sign-ins</h2>
              <p className="mt-1 text-sm text-muted">If you don't recognise one, change your password and tell an administrator.</p>
              <ul className="mt-3 divide-y divide-divider text-sm">
                {data.recent_sign_ins.map((e) => (
                  <li key={e.id} className="flex justify-between gap-4 py-2">
                    <span className={e.action === 'sign_in_failed' ? 'font-semibold text-attention' : 'text-body'}>
                      {AUDIT_ACTIONS[e.action]}{e.detail && `: ${e.detail}`}
                    </span>
                    <span className="tabular-nums text-muted">{formatDate(e.at)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        )}
      </div>
    </>
  )
}
