import { useRef } from 'react'

// Six boxes for the authenticator code, like the mobile app: typing moves to the next box,
// Backspace goes back, and pasting "123 456" fills them all. Calls onComplete when full.
export default function CodeBoxes({ value, onChange, onComplete, disabled }) {
  const boxes = useRef([])
  const digits = value.padEnd(6, ' ').slice(0, 6).split('')

  const set = (next) => {
    const clean = next.replace(/\D/g, '').slice(0, 6)
    onChange(clean)
    boxes.current[Math.min(clean.length, 5)]?.focus()
    if (clean.length === 6) onComplete?.(clean)
  }

  return (
    <div className="flex justify-between gap-2" role="group" aria-label="6-digit code">
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => { boxes.current[i] = el }}
          value={digit.trim()}
          disabled={disabled}
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          autoFocus={i === 0}
          maxLength={6}
          aria-label={`Digit ${i + 1}`}
          onChange={(e) => {
            const typed = e.target.value.replace(/\D/g, '')
            if (typed.length > 1) set(typed)                      // a paste or autofill
            else set((value.slice(0, i) + typed).slice(0, 6))
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !digit.trim() && i > 0) {
              e.preventDefault()
              onChange(value.slice(0, i - 1))
              boxes.current[i - 1]?.focus()
            }
          }}
          onFocus={(e) => e.target.select()}
          className="h-14 w-full min-w-0 rounded-md border border-divider-strong bg-white text-center font-mono text-2xl text-ink outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
        />
      ))}
    </div>
  )
}
