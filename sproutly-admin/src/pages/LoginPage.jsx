import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'

import { login, submitBackupCode, submitCode } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import AuthFrame, { AuthAlert, AuthButton, authInput } from '../components/AuthFrame.jsx'
import CodeBoxes from '../components/CodeBoxes.jsx'

// Same idea as the mobile app's eye-outline / eye-off-outline icons.
function EyeIcon({ open }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {!open && <path d="M3 3l18 18" />}
    </svg>
  )
}

/** Password, then the authenticator code (set up on first sign-in). No sign-up: accounts are created for staff. */
export default function LoginPage() {
  const { user, signIn, endedBecause } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [capsLock, setCapsLock] = useState(false)
  const [challenge, setChallenge] = useState(null)
  const [code, setCode] = useState('')
  // A lost or broken phone: sign in once with a backup code instead.
  const [useBackup, setUseBackup] = useState(false)
  const [backupCode, setBackupCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (user) return <Navigate to={user.role === 'admin' ? '/' : '/referrals'} replace />

  const run = async (action) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e.status === 401 ? 'That email and password do not match an account.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  const sendPassword = (event) => {
    event.preventDefault()
    run(async () => setChallenge(await login(email, password)))
  }

  const enter = (session) => {
    signIn(session)
    navigate(location.state?.from ?? (session.user.role === 'admin' ? '/' : '/referrals'), { replace: true })
  }

  const sendCode = (value = code) => {
    if (value.length !== 6 || busy) return
    run(async () => {
      try {
        enter(await submitCode(challenge.next_step, challenge.mfa_token, value))
      } catch (e) {
        setCode('')
        throw e
      }
    })
  }

  const sendBackupCode = () => run(async () => enter(await submitBackupCode(challenge.mfa_token, backupCode)))

  const back = () => {
    setChallenge(null)
    setCode('')
    setUseBackup(false)
    setBackupCode('')
    setError(null)
  }

  const watchCaps = (e) => setCapsLock(e.getModifierState?.('CapsLock') ?? false)

  return (
    <AuthFrame>
      {!challenge ? (
        <form onSubmit={sendPassword} noValidate>
          <h1 className="text-2xl font-semibold text-ink">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Use your work email.</p>
          {endedBecause && (
            <p className="mt-4 rounded-md border border-divider bg-surface px-4 py-3 text-sm text-body">{endedBecause}</p>
          )}

          <div className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold text-ink">Email</span>
              <input className={authInput} type="email" autoComplete="username" required autoFocus value={email}
                     onChange={(e) => setEmail(e.target.value)} />
            </label>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-ink">Password</label>
              <div className="relative">
                <input id="password" className={`${authInput} pr-12`} type={showPassword ? 'text' : 'password'}
                       autoComplete="current-password" required value={password}
                       onChange={(e) => setPassword(e.target.value)} onKeyUp={watchCaps} onKeyDown={watchCaps} />
                <button type="button" onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
                        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-md text-muted hover:text-ink">
                  <EyeIcon open={!showPassword} />
                </button>
              </div>
              {capsLock && <span className="mt-1.5 block text-xs text-attention-ink">Caps Lock is on.</span>}
            </div>
            {error && <AuthAlert>{error}</AuthAlert>}
            <div className="pt-1">
              <AuthButton busy={busy} disabled={!email.includes('@') || !password}>Continue</AuthButton>
            </div>
          </div>

          <p className="mt-5 text-sm text-muted">Forgot your password? Ask your administrator to reset it.</p>
        </form>
      ) : useBackup ? (
        <form onSubmit={(e) => { e.preventDefault(); sendBackupCode() }} noValidate>
          <button type="button" onClick={() => { setUseBackup(false); setError(null) }}
                  className="mb-4 text-sm font-semibold text-primary hover:underline">
            Use the authenticator app instead
          </button>
          <h1 className="text-2xl font-semibold text-ink">Use a backup code</h1>
          <p className="mt-1 text-sm text-muted">Enter one of the codes you saved. Each code works once.</p>
          <div className="mt-5 space-y-4">
            <input className={`${authInput} font-mono tracking-widest`} autoComplete="one-time-code" autoFocus
                   placeholder="1234-5678" value={backupCode} onChange={(e) => setBackupCode(e.target.value)}
                   aria-label="Backup code" />
            {error && <AuthAlert>{error}</AuthAlert>}
            <AuthButton busy={busy} disabled={backupCode.replace(/\D/g, '').length !== 8}>Sign in</AuthButton>
          </div>
          <p className="mt-5 text-sm text-muted">No codes left? Ask your administrator to reset your authenticator.</p>
        </form>
      ) : (
        <form onSubmit={(e) => { e.preventDefault(); sendCode() }} noValidate>
          <p className="mb-4 text-sm text-muted">
            Signing in as <span className="font-semibold text-ink">{email}</span>{' '}
            <button type="button" onClick={back} className="ml-1 font-semibold text-primary hover:underline">Change</button>
          </p>
          <h1 className="text-2xl font-semibold text-ink">
            {challenge.next_step === 'setup' ? 'Set up your authenticator' : 'Enter your code'}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {challenge.next_step === 'setup'
              ? 'Scan with Google or Microsoft Authenticator, then enter the code it shows.'
              : 'Open your authenticator app and enter the 6-digit code shown for Sproutly.'}
          </p>

          {challenge.next_step === 'setup' && (
            <div className="mt-4 rounded-md border border-divider bg-white p-3 text-center">
              {challenge.setup?.qr_code ? (
                <img src={challenge.setup.qr_code} alt="QR code for your authenticator app" className="mx-auto h-32 w-32" />
              ) : (
                <div className="mx-auto flex h-32 w-32 items-center justify-center rounded bg-surface text-xs text-muted">QR code</div>
              )}
              <p className="mt-2 text-xs text-muted">
                Can't scan it? Enter this key: <span className="select-all font-mono tracking-widest text-ink">{challenge.setup?.secret}</span>
              </p>
            </div>
          )}

          <div className="mt-5 space-y-4">
            <CodeBoxes value={code} onChange={setCode} onComplete={sendCode} disabled={busy} />
            {error && <AuthAlert>{error}</AuthAlert>}
            <AuthButton busy={busy} disabled={code.length !== 6}>Sign in</AuthButton>
          </div>
          {challenge.next_step === 'verify' && (
            <>
              <p className="mt-5 text-sm text-muted">The code changes every 30 seconds. If it is about to change, wait for the next one.</p>
              <button type="button" onClick={() => { setUseBackup(true); setError(null) }}
                      className="mt-3 text-sm font-semibold text-primary underline">
                Lost your phone? Use a backup code
              </button>
            </>
          )}
        </form>
      )}
    </AuthFrame>
  )
}
