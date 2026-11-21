import { useId, useState } from 'react'
import { fieldClass } from './ui.jsx'

/**
 * A dropdown you can type into: for long lists such as the 47 counties, typing "nak" leaves
 * Nakuru. options is [{ value, label }]; an option with value '' (e.g. "All counties") is allowed.
 * Arrow keys move, Enter picks, Escape closes without changing anything.
 */
export default function SearchSelect({ value, onChange, options, label, placeholder = 'Type to search', className = '' }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()
  const current = options.find((o) => o.value === value)
  const q = query.trim().toLowerCase()
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options

  const close = () => { setOpen(false); setQuery('') }
  const pick = (option) => { onChange(option.value); close() }
  const start = () => { setOpen(true); setQuery(''); setActive(0) }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) start()
      else setActive((i) => Math.min(i + 1, shown.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && open && shown[active]) {
      e.preventDefault()
      pick(shown[active])
    } else if (e.key === 'Escape') {
      close()
    }
  }

  return (
    <div className={`relative ${className}`}>
      <input
        type="text" role="combobox" aria-label={label} aria-expanded={open} aria-controls={listId}
        aria-autocomplete="list" autoComplete="off"
        className={`w-full ${fieldClass} pr-8`}
        value={open ? query : (current?.label ?? '')}
        placeholder={open ? (current?.label ?? placeholder) : placeholder}
        onFocus={start}
        onMouseDown={() => { if (!open) start() }}
        onBlur={close}
        onChange={(e) => { setQuery(e.target.value); setActive(0); setOpen(true) }}
        onKeyDown={onKeyDown}
      />
      <svg aria-hidden="true" viewBox="0 0 20 20" className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted">
        <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {open && (
        <ul id={listId} role="listbox"
            className="absolute z-20 mt-1 max-h-64 w-full min-w-48 overflow-y-auto rounded-md border border-divider-strong bg-white py-1 text-sm shadow-lg">
          {shown.length === 0 ? (
            <li className="px-3 py-2 text-muted">No match</li>
          ) : shown.map((o, i) => (
            <li key={o.value || '__all'} role="option" aria-selected={o.value === value}
                // mousedown, not click: picking happens before the field loses focus and closes the list.
                onMouseDown={(e) => { e.preventDefault(); pick(o) }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-2 ${i === active ? 'bg-primary/10' : ''} ${o.value === value ? 'font-semibold text-primary' : 'text-ink'}`}>
              {o.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
