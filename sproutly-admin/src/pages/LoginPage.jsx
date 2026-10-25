import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'

import { login, submitBackupCode, submitCode } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import CodeBoxes from '../components/CodeBoxes.jsx'

const YEAR = new Date().getFullYear()

// Dark glass inputs on the green, as on the mobile login screen.
const input =
  'glass-input h-11 w-full rounded-xl border border-white/10 bg-black/20 px-4 text-[15px] text-white outline-none transition placeholder:text-white/40 focus:border-white/40 focus:ring-4 focus:ring-white/10'

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

function Spinner() {
  return <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden="true" />
}

function Alert({ children }) {
  return (
    <p role="alert" className="rounded-xl border border-[#e8a27a]/30 bg-[#b4622a]/25 px-4 py-3 text-sm text-white">
      {children}
    </p>
  )
}

// White button with green text, as on the mobile login screen.
function SubmitButton({ busy, disabled, children }) {
  return (
    <button type="submit" disabled={busy || disabled}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white text-base font-bold text-primary shadow-lg shadow-black/20 transition hover:bg-white/90 focus:outline-none focus:ring-4 focus:ring-white/30 disabled:cursor-not-allowed disabled:opacity-60">
      {busy ? <><Spinner /> Checking</> : children}
    </button>
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
    // Wide screens: a white side with the logo, and the green side holding the glass card.
    // Narrow screens: green only, logo above the card. Sized to fit one screen without scrolling.
    <div className="min-h-dvh bg-white lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <aside className="hidden flex-col px-12 py-10 lg:flex">
        <div className="my-auto flex flex-col items-center text-center">
          <img src="/sproutly-logo.png" alt="" className="h-24 w-24" />
          <span className="mt-3 text-3xl font-semibold tracking-tight text-forest-mid">Sproutly</span>
        </div>
        <p className="text-center text-xs text-faint">&copy; {YEAR} Sproutly</p>
      </aside>

    {/* The green side: a straight edge, with a light sheen from the top-left. */}
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-forest-deep via-forest-mid to-forest-light px-4 py-6 text-white">
      <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-br from-white/[0.07] via-white/[0.01] to-transparent lg:block" />

      <div className="relative mb-6 flex items-center gap-2.5 lg:hidden">
        <img src="/sproutly-logo.png" alt="" className="h-9 w-9" />
        <span className="text-xl font-semibold tracking-tight">Sproutly</span>
      </div>

      <div className="relative w-full max-w-[22rem]">
        {!challenge ? (
          <form onSubmit={sendPassword} noValidate>
            <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
            <p className="mt-1.5 text-sm text-white/65">Use your work email.</p>
            {endedBecause && (
              <p className="mt-4 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white">{endedBecause}</p>
            )}

            <div className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold">Email</span>
                <input className={input} type="email" autoComplete="username" required autoFocus value={email}
                       onChange={(e) => setEmail(e.target.value)} />
              </label>
              <div>
                <label htmlFor="password" className="mb-2 block text-sm font-semibold">Password</label>
                <div className="relative">
                  <input id="password" className={`${input} pr-12`} type={showPassword ? 'text' : 'password'}
                         autoComplete="current-password" required value={password}
                         onChange={(e) => setPassword(e.target.value)} onKeyUp={watchCaps} onKeyDown={watchCaps} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)}
                          aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword}
                          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-white/85 hover:text-white focus:text-white focus:outline-none">
                    <EyeIcon open={!showPassword} />
                  </button>
                </div>
                {capsLock && <span className="mt-2 block text-xs text-[#f3c2a2]">Caps Lock is on.</span>}
              </div>
              {error && <Alert>{error}</Alert>}
              <div className="pt-1">
                <SubmitButton busy={busy} disabled={!email.includes('@') || !password}>Continue</SubmitButton>
              </div>
            </div>

            <p className="mt-5 text-sm text-white/60">
              Forgot your password? Ask your administrator to reset it.
            </p>
          </form>
        ) : useBackup ? (
          <form onSubmit={(e) => { e.preventDefault(); sendBackupCode() }} noValidate>
            <button type="button" onClick={() => { setUseBackup(false); setError(null) }}
                    className="mb-4 text-sm font-medium text-white/65 hover:text-white">
              &larr; Use the authenticator app
            </button>
            <h1 className="text-2xl font-semibold tracking-tight">Use a backup code</h1>
            <p className="mt-1.5 text-sm leading-6 text-white/65">
              Enter one of the codes you saved when you made them. Each code works once.
            </p>
            <div className="mt-5 space-y-4">
              <input className={`${input} font-mono tracking-widest`} autoComplete="one-time-code" autoFocus
                     placeholder="1234-5678" value={backupCode} onChange={(e) => setBackupCode(e.target.value)}
                     aria-label="Backup code" />
              {error && <Alert>{error}</Alert>}
              <SubmitButton busy={busy} disabled={backupCode.replace(/\D/g, '').length !== 8}>Sign in</SubmitButton>
            </div>
            <p className="mt-5 text-sm text-white/60">
              No codes left? Ask your administrator to reset your authenticator.
            </p>
          </form>
        ) : (
          <form onSubmit={(e) => { e.preventDefault(); sendCode() }} noValidate>
            <button type="button" onClick={back} className="mb-4 text-sm font-medium text-white/65 hover:text-white">
              &larr; {email}
            </button>
            <h1 className="text-2xl font-semibold tracking-tight">
              {challenge.next_step === 'setup' ? 'Set up your authenticator' : 'Enter your code'}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-white/65">
              {challenge.next_step === 'setup'
                ? 'Scan with Google or Microsoft Authenticator, then enter the code it shows.'
                : 'Open your authenticator app and enter the 6-digit code shown for Sproutly.'}
            </p>

            {challenge.next_step === 'setup' && (
              <div className="mt-4 rounded-2xl bg-white p-3 text-center">
                {/* The QR code stays on white so phones can scan it. */}
                {challenge.setup?.qr_code ? (
                  <img src={challenge.setup.qr_code} alt="QR code for your authenticator app" className="mx-auto h-32 w-32" />
                ) : (
                  <div className="mx-auto flex h-32 w-32 items-center justify-center rounded bg-surface text-xs text-faint">
                    QR code
                  </div>
                )}
                <p className="mt-2 text-xs text-muted">
                  Can't scan it? Enter this key: <span className="select-all font-mono tracking-widest text-ink">{challenge.setup?.secret}</span>
                </p>
              </div>
            )}

            <div className="mt-5 space-y-4">
              <CodeBoxes value={code} onChange={setCode} onComplete={sendCode} disabled={busy} />
              {error && <Alert>{error}</Alert>}
              <SubmitButton busy={busy} disabled={code.length !== 6}>Sign in</SubmitButton>
            </div>
            {challenge.next_step === 'verify' && (
              <>
                <p className="mt-5 text-sm text-white/60">
                  The code changes every 30 seconds. If it is about to change, wait for the next one.
                </p>
                <button type="button" onClick={() => { setUseBackup(true); setError(null) }}
                        className="mt-3 text-sm font-semibold text-white/80 underline hover:text-white">
                  Lost your phone? Use a backup code
                </button>
              </>
            )}
          </form>
        )}
      </div>
    </div>
    </div>
  )
}
