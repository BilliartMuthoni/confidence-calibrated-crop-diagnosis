const YEAR = new Date().getFullYear()

// The sign-in and set-password pages: a solid green brand panel beside a plain white form on
// wide screens (the same split as the portal's menu and work area); the form alone on phones.
export default function AuthFrame({ children }) {
  return (
    <div className="min-h-dvh bg-white lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <aside className="hidden flex-col justify-between bg-forest-mid px-12 py-10 text-white lg:flex">
        <div className="flex items-center gap-2.5">
          <img src="/sproutly-logo.png" alt="" className="h-9 w-9" />
          <span className="text-xl font-semibold">Sproutly</span>
        </div>
        <div className="max-w-sm">
          <p className="text-2xl font-semibold leading-snug">Staff portal</p>
          <p className="mt-2 text-sm text-white/75">
            For county extension officers answering farmers' referred cases, and for the administrators who run Sproutly.
          </p>
        </div>
        <p className="text-xs text-white/65">&copy; {YEAR} Sproutly</p>
      </aside>

      <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-8">
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <img src="/sproutly-logo.png" alt="" className="h-9 w-9" />
          <span className="text-xl font-semibold text-ink">Sproutly</span>
        </div>
        <div className="w-full max-w-[22rem]">{children}</div>
        <a href="/privacy" className="mt-10 text-xs font-semibold text-muted hover:text-ink hover:underline">Privacy policy</a>
      </main>
    </div>
  )
}

export const authInput =
  'h-11 w-full rounded-md border border-divider-strong bg-white px-3.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15'

export function AuthAlert({ children }) {
  return (
    <p role="alert" className="rounded-md border border-attention-ink/25 bg-attention-tint px-4 py-3 text-sm text-attention-ink">
      {children}
    </p>
  )
}

export function AuthButton({ busy, disabled, children, busyLabel = 'Checking' }) {
  return (
    <button type="submit" disabled={busy || disabled}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-white transition-colors hover:bg-forest-mid disabled:cursor-not-allowed disabled:opacity-50">
      {busy && <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white motion-safe:animate-spin" aria-hidden="true" />}
      {busy ? busyLabel : children}
    </button>
  )
}
