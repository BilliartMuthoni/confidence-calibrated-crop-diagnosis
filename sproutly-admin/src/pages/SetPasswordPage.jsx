import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { setStaffPassword } from '../api/admin.js'

const MIN = 12
const input =
  'h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-[15px] text-white outline-none transition placeholder:text-white/40 focus:border-white/40 focus:ring-4 focus:ring-white/10'

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
    <div className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-br from-forest-deep via-forest-mid to-forest-light px-4 py-6 text-white">
      <div className="mb-6 flex items-center gap-2.5">
        <img src="/sproutly-logo.png" alt="" className="h-9 w-9" />
        <span className="text-xl font-semibold tracking-tight">Sproutly</span>
      </div>
      <div className="w-full max-w-[22rem]">
        {done ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Password saved</h1>
            <p className="mt-1.5 text-sm leading-6 text-white/65">
              Sign in with your work email and this password. You will set up your authenticator app next.
            </p>
            <Link to="/login" className="mt-6 flex h-11 items-center justify-center rounded-xl bg-white font-bold text-primary">
              Go to sign in
            </Link>
          </>
        ) : !token ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">This link is incomplete</h1>
            <p className="mt-1.5 text-sm leading-6 text-white/65">Open the whole link you were sent, or ask your administrator for a new one.</p>
          </>
        ) : (
          <form onSubmit={save} noValidate>
            <h1 className="text-2xl font-semibold tracking-tight">Choose your password</h1>
            <p className="mt-1.5 text-sm leading-6 text-white/65">
              At least {MIN} characters. A short sentence is easy to remember and hard to guess. This link works once.
            </p>
            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">New password</span>
                <input className={input} type="password" autoComplete="new-password" autoFocus value={password}
                       onChange={(e) => setPassword(e.target.value)} />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Type it again</span>
                <input className={input} type="password" autoComplete="new-password" value={again}
                       onChange={(e) => setAgain(e.target.value)} />
                {again && again !== password && <span className="mt-2 block text-xs text-[#f3c2a2]">The two passwords are different.</span>}
              </label>
              {error && (
                <p role="alert" className="rounded-xl border border-[#e8a27a]/30 bg-[#b4622a]/25 px-4 py-3 text-sm text-white">{error}</p>
              )}
              <button type="submit" disabled={busy || password.length < MIN || password !== again}
                      className="flex h-11 w-full items-center justify-center rounded-xl bg-white text-base font-bold text-primary shadow-lg shadow-black/20 transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-60">
                {busy ? 'Saving' : 'Save password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
