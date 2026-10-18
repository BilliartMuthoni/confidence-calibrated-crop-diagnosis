// Small building blocks shared by every page, in the mobile app's light-screen style.

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

export function Card({ children, className = '' }) {
  return <section className={`rounded-2xl border border-divider bg-white p-5 ${className}`}>{children}</section>
}

const BUTTON = {
  primary: 'bg-primary text-white hover:bg-forest-light',
  secondary: 'border border-divider bg-white text-ink hover:bg-surface',
  danger: 'border border-attention/40 bg-white text-attention hover:bg-attention/5',
  expert: 'bg-expert text-white hover:opacity-90',
}

export function Button({ variant = 'primary', className = '', busy = false, children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      disabled={busy || props.disabled}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON[variant]} ${className}`}
    >
      {busy ? 'Working...' : children}
    </button>
  )
}

const BADGE = {
  waiting: 'bg-expert/10 text-expert',
  answered: 'bg-healthy/10 text-healthy',
  expired: 'bg-faint/15 text-muted',
  active: 'bg-healthy/10 text-healthy',
  retired: 'bg-faint/15 text-muted',
  inactive: 'bg-faint/15 text-muted',
  disease: 'bg-attention/10 text-attention',
  neutral: 'bg-surface text-muted',
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${BADGE[tone]}`}>{children}</span>
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-semibold text-ink">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs leading-5 text-faint">{hint}</span>}
    </label>
  )
}

export const inputClass =
  'w-full rounded-xl border border-divider bg-white px-3.5 py-2.5 text-sm text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15'

export function ErrorBox({ error, onRetry }) {
  if (!error) return null
  return (
    <div role="alert" className="flex items-start justify-between gap-4 rounded-xl border border-attention/30 bg-attention/5 px-4 py-3 text-sm text-attention">
      <span>{error.message ?? String(error)}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold underline">
          Try again
        </button>
      )}
    </div>
  )
}

export function Loading({ label = 'Loading...' }) {
  return <p className="py-10 text-center text-sm text-muted">{label}</p>
}

export function Empty({ children }) {
  return <p className="py-10 text-center text-sm leading-6 text-muted">{children}</p>
}

/** Horizontal bars with the value written at the end (one series, so no legend). */
export function BarList({ rows, format = (v) => v }) {
  const max = Math.max(1, ...rows.map(([, value]) => value))
  return (
    <ul className="space-y-2.5">
      {rows.map(([label, value]) => (
        <li key={label} className="grid grid-cols-[minmax(0,11rem)_1fr_3rem] items-center gap-3 text-sm" title={`${label}: ${format(value)}`}>
          <span className="truncate text-body">{label}</span>
          <span className="h-2.5 rounded-full bg-surface">
            <span className="block h-2.5 rounded-full bg-primary" style={{ width: `${(value / max) * 100}%` }} />
          </span>
          <span className="text-right tabular-nums text-muted">{format(value)}</span>
        </li>
      ))}
    </ul>
  )
}
