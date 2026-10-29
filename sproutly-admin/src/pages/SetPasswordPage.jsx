import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { setStaffPassword } from '../api/admin.js'
import AuthFrame, { AuthAlert, AuthButton, authInput } from '../components/AuthFrame.jsx'

const MIN = 12

/** Opened from a one-time invite or reset link an admin passed on: choose a password, then sign in. */
export default function SetPasswordPage() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)

  const save = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await setStaffPassword(token, password)
      setDone(true)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthFrame>
      {done ? (
        <>
          <h1 className="text-2xl font-semibold text-ink">Password saved</h1>
          <p className="mt-1 text-sm text-muted">Sign in with your work email and this password. You set up your authenticator app next.</p>
          <Link to="/login" className="mt-6 flex h-11 items-center justify-center rounded-md bg-primary text-sm font-semibold text-white hover:bg-forest-mid">
            Go to sign in
          </Link>
        </>
      ) : !token ? (
        <>
          <h1 className="text-2xl font-semibold text-ink">This link is incomplete</h1>
          <p className="mt-1 text-sm text-muted">Open the whole link you were sent, or ask your administrator for a new one.</p>
        </>
      ) : (
        <form onSubmit={save} noValidate>
          <h1 className="text-2xl font-semibold text-ink">Choose your password</h1>
          <p className="mt-1 text-sm text-muted">
            At least {MIN} characters. A short sentence is easy to remember and hard to guess. This link works once.
          </p>
          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">New password</span>
              <input className={authInput} type="password" autoComplete="new-password" autoFocus value={password}
                     onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">Type it again</span>
              <input className={authInput} type="password" autoComplete="new-password" value={again}
                     onChange={(e) => setAgain(e.target.value)} />
              {again && again !== password && <span className="mt-1.5 block text-xs text-attention-ink">The two passwords are different.</span>}
            </label>
            {error && <AuthAlert>{error}</AuthAlert>}
            <AuthButton busy={busy} busyLabel="Saving" disabled={password.length < MIN || password !== again}>Save password</AuthButton>
          </div>
        </form>
      )}
    </AuthFrame>
  )
}
