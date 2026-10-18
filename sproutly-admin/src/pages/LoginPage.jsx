import { useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'

import { USE_SAMPLE_DATA, login, submitCode } from '../api/admin.js'
import { SAMPLE_PASSWORD } from '../api/sampleData.js'
import { useAuth } from '../auth/context.js'

const glassInput =
  'w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3.5 text-base text-white placeholder-white/40 outline-none focus:border-white/40'

/** Step 1 (password) and step 2 (authenticator code), styled like the mobile login. */
export default function LoginPage() {
  const { user, signIn } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [challenge, setChallenge] = useState(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  if (user) return <Navigate to={user.role === 'admin' ? '/' : '/referrals'} replace />

  const run = async (action) => {
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (e) {
      setError(e.status === 401 ? 'Wrong email or password.' : e.message)
    } finally {
      setBusy(false)
    }
  }

  const sendPassword = (event) => {
    event.preventDefault()
    run(async () => setChallenge(await login(email, password)))
  }

  const sendCode = (event) => {
    event.preventDefault()
    run(async () => {
      const session = await submitCode(challenge.next_step, challenge.mfa_token, code.replace(/\s/g, ''))
      signIn(session)
      const home = session.user.role === 'admin' ? '/' : '/referrals'
      navigate(location.state?.from ?? home, { replace: true })
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-forest-deep via-forest-mid to-forest-light px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center text-white">
          <img src="/favicon.svg" alt="" className="mx-auto mb-4 h-12 w-12" />
          <h1 className="text-3xl font-bold">{challenge ? 'Enter your code' : 'Sproutly portal'}</h1>
          <p className="mt-2 text-base leading-6 text-white/70">
            {!challenge && 'For administrators and county extension officers.'}
            {challenge?.next_step === 'verify' &&
              'Open Google Authenticator or Microsoft Authenticator and type the 6-digit code shown under Sproutly.'}
            {challenge?.next_step === 'setup' &&
              'First sign-in: add Sproutly to your authenticator app, then type the 6-digit code it shows. The code is required for every sign-in.'}
          </p>
        </div>

        {!challenge ? (
          <form onSubmit={sendPassword} className="space-y-5">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white">Email address</span>
              <input className={glassInput} type="email" autoComplete="username" required value={email}
                     onChange={(e) => setEmail(e.target.value)} placeholder="you@county.go.ke" />
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-white">Password</span>
              <input className={glassInput} type="password" autoComplete="current-password" required value={password}
                     onChange={(e) => setPassword(e.target.value)} />
            </label>
            {error && <p role="alert" className="rounded-xl bg-black/25 px-4 py-3 text-sm text-white">{error}</p>}
            <button type="submit" disabled={busy}
                    className="w-full rounded-xl bg-white py-4 text-lg font-bold text-primary shadow-lg disabled:opacity-70">
              {busy ? 'Checking...' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={sendCode} className="space-y-5">
            {challenge.next_step === 'setup' && (
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center text-white">
                {challenge.setup?.qr_code ? (
                  <img src={challenge.setup.qr_code} alt="QR code to add Sproutly to your authenticator app"
                       className="mx-auto h-44 w-44 rounded-lg bg-white p-2" />
                ) : (
                  <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-lg bg-white/10 text-xs text-white/60">
                    QR code appears here
                  </div>
                )}
                <p className="mt-3 text-xs text-white/60">Or enter this setup key by hand:</p>
                <p className="mt-1 font-mono text-sm tracking-wider">{challenge.setup?.secret}</p>
                <p className="mt-3 text-xs leading-5 text-white/60">
                  Treat this screen like a password: do not screenshot or share it.
                </p>
              </div>
            )}
            <input className={`${glassInput} text-center font-mono text-2xl tracking-[0.5em]`} inputMode="numeric"
                   autoComplete="one-time-code" maxLength={7} required value={code} autoFocus
                   onChange={(e) => setCode(e.target.value.replace(/[^\d ]/g, ''))} aria-label="6-digit code" />
            {error && <p role="alert" className="rounded-xl bg-black/25 px-4 py-3 text-sm text-white">{error}</p>}
            <button type="submit" disabled={busy || code.replace(/\s/g, '').length !== 6}
                    className="w-full rounded-xl bg-white py-4 text-lg font-bold text-primary shadow-lg disabled:opacity-50">
              {busy ? 'Checking...' : 'Sign in'}
            </button>
            <button type="button" onClick={() => { setChallenge(null); setCode(''); setError(null) }}
                    className="w-full text-sm font-semibold text-white/70 underline">
              Back
            </button>
            <p className="text-center text-sm leading-5 text-white/50">
              The code changes every 30 seconds. If it is about to change, wait for the next one.
            </p>
          </form>
        )}

        {USE_SAMPLE_DATA && !challenge && (
          <div className="mt-8 rounded-2xl border border-white/10 bg-black/20 p-4 text-xs leading-5 text-white/70">
            <p className="font-semibold text-white">Sample data mode (no backend)</p>
            <p>Admin: admin@example.org</p>
            <p>Officer: officer.nakuru@example.org</p>
            <p>New officer (first sign-in): new.officer@example.org</p>
            <p>Password: {SAMPLE_PASSWORD}. Code: any 6 digits.</p>
          </div>
        )}
      </div>
    </div>
  )
}
