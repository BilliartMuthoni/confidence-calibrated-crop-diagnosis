// Small building blocks shared by every page. Each colour has one meaning (see index.css):
// green is the main action and the open page, orange needs attention, blue is an officer's
// answer, and everything else stays neutral.

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-muted">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  )
}

export function Card({ children, className = '' }) {
  return <section className={`rounded-lg border border-divider bg-white p-5 ${className}`}>{children}</section>
}

const BUTTON = {
  primary: 'bg-primary text-white hover:bg-forest-mid',
  secondary: 'border border-divider-strong bg-white text-ink hover:bg-surface',
  danger: 'border border-attention-ink/40 bg-white text-attention-ink hover:bg-attention-tint',
  expert: 'bg-expert text-white hover:bg-expert-ink',
}

function Spinner() {
  return (
    <svg className="h-4 w-4 motion-safe:animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function Button({ variant = 'primary', className = '', busy = false, children, ...props }) {
  return (
    <button
      type="button"
      {...props}
      disabled={busy || props.disabled}
      aria-busy={busy || undefined}
      className={`inline-flex h-9 items-center justify-center gap-2 rounded-md px-3.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON[variant]} ${className}`}
    >
      {busy && <Spinner />}
      {children}
    </button>
  )
}

const BADGE = {
  new: 'bg-neutral-tint text-neutral-ink',
  in_review: 'bg-neutral-tint text-neutral-ink',
  waiting: 'bg-neutral-tint text-neutral-ink',
  answered: 'bg-expert-tint text-expert-ink',
  expired: 'bg-neutral-tint text-neutral-ink',
  active: 'bg-healthy-tint text-healthy-ink',
  retired: 'bg-neutral-tint text-neutral-ink',
  inactive: 'bg-neutral-tint text-neutral-ink',
  disease: 'bg-attention-tint text-attention-ink',
  attention: 'bg-attention-tint text-attention-ink',
  // The only solid badge: what needs action now, so the eye goes there first.
  urgent: 'bg-attention-strong text-white',
  neutral: 'bg-neutral-tint text-neutral-ink',
}

export function Badge({ tone = 'neutral', children }) {
  return (
    <span className={`inline-flex h-[22px] items-center whitespace-nowrap rounded px-2 text-xs font-semibold ${BADGE[tone]}`}>
      {children}
    </span>
  )
}

/** Tabs as tinted pills, like the open page in the menu: [value, label, count?]. */
export function Tabs({ tabs, value, onChange, label }) {
  return (
    // Scrolls sideways on a phone; overflow-y is clipped so it never adds a scrollbar.
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto overflow-y-hidden">
      {tabs.map(([key, text, count]) => {
        const on = key === value
        return (
          <button
            key={text}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(key)}
            className={`flex h-9 items-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-semibold ${
              on ? 'bg-healthy-tint text-primary' : 'text-muted hover:bg-neutral-tint hover:text-ink'
            }`}
          >
            {text}
            {typeof count === 'number' && (
              <span className="rounded-full bg-neutral-tint px-1.5 text-xs leading-[18px] text-neutral-ink tabular-nums">{count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** A column heading that sorts the table: click once for ascending, again for descending.
 *  `sort` is { key, dir } from the page; the arrow shows only on the column in use. */
export function SortHeader({ label, column, sort, onSort, className = '' }) {
  const active = sort.key === column
  const next = active && sort.dir === 'asc' ? 'desc' : 'asc'
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={className}>
      <button type="button" onClick={() => onSort({ key: column, dir: next })}
              className="inline-flex items-center gap-1 font-semibold hover:text-ink">
        {label}
        <svg viewBox="0 0 12 12" className={`h-3 w-3 ${active ? 'text-ink' : 'text-divider-strong'}`} aria-hidden="true">
          <path d="M3.5 4.5 6 2l2.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.4"
                opacity={active && sort.dir === 'desc' ? 0.35 : 1} />
          <path d="M3.5 7.5 6 10l2.5-2.5" fill="none" stroke="currentColor" strokeWidth="1.4"
                opacity={active && sort.dir === 'asc' ? 0.35 : 1} />
        </svg>
      </button>
    </th>
  )
}

/** Under a table: which rows are showing, and Previous / Next. Hidden when everything fits on one page. */
export function Pagination({ paged }) {
  if (paged.pages <= 1) return null
  const first = (paged.page - 1) * paged.size + 1
  const last = Math.min(paged.page * paged.size, paged.total)
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3 border-t border-divider px-4 py-2.5 text-sm">
      <span className="tabular-nums text-muted">Showing {first}–{last} of {paged.total}</span>
      <div className="flex items-center gap-2">
        <span className="mr-1 tabular-nums text-muted">Page {paged.page} of {paged.pages}</span>
        <Button variant="secondary" className="h-8" disabled={paged.page === 1} onClick={() => paged.go(paged.page - 1)}>
          Previous
        </Button>
        <Button variant="secondary" className="h-8" disabled={paged.page === paged.pages} onClick={() => paged.go(paged.page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  )
}

/** The white box a table sits in; wide tables scroll inside it on a phone. */
export function TableBox({ children, className = '' }) {
  return <div className={`overflow-x-auto rounded-lg border border-divider bg-white ${className}`}>{children}</div>
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

const fieldClass =
  'rounded-md border border-divider-strong bg-white px-3 py-2 text-sm text-ink accent-primary outline-none focus:border-primary focus:ring-2 focus:ring-primary/15'

// Form fields fill their column; filter dropdowns above a list are only as wide as their text,
// so several sit on one line. (Adding w-auto to inputClass lost to its w-full.)
export const inputClass = `w-full ${fieldClass}`
export const filterClass = `w-auto max-w-full ${fieldClass}`

export function ErrorBox({ error, onRetry }) {
  if (!error) return null
  return (
    <div role="alert" className="flex items-start justify-between gap-4 rounded-md border border-attention-ink/25 bg-attention-tint px-4 py-3 text-sm text-attention-ink">
      <span>{error.message ?? String(error)}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold underline">
          Try again
        </button>
      )}
    </div>
  )
}

/** Grey placeholder rows while a page loads, instead of a "Loading..." line. */
export function Loading({ label = 'Loading', rows = 5 }) {
  return (
    <div role="status" aria-label={label} className="space-y-3 py-2">
      <span className="block h-7 w-48 rounded bg-neutral-tint motion-safe:animate-pulse" />
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="block h-10 rounded bg-neutral-tint/70 motion-safe:animate-pulse" />
      ))}
    </div>
  )
}

/** An empty list: a short title, one line, and at most one action. */
export function Empty({ title, children, action }) {
  return (
    <div className="px-4 py-10 text-center">
      {title && <p className="font-semibold text-ink">{title}</p>}
      {children && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
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
