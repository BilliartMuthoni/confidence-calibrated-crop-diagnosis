import { Link } from 'react-router'

export const CONTACT_EMAIL = 'sproutly.ke.support@gmail.com'

// Plain public pages (privacy policy, account deletion) that anyone can read without signing in:
// Google Play links to them, including for people who no longer have the app.
export default function PublicPage({ title, intro, updated, children }) {
  return (
    <div className="min-h-dvh bg-white">
      <header className="border-b border-divider bg-forest-mid text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-2.5 px-5 py-4">
          <img src="/sproutly-logo.png" alt="" className="h-8 w-8" />
          <span className="text-lg font-bold">Sproutly</span>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-10">
        <h1 className="text-3xl font-semibold text-ink">{title}</h1>
        {updated && <p className="mt-2 text-sm text-muted">Last updated {updated}</p>}
        {intro && <p className="mt-4 text-base leading-7 text-body">{intro}</p>}
        <div className="mt-8 space-y-8">{children}</div>
        <nav aria-label="Other pages" className="mt-12 flex flex-wrap gap-4 border-t border-divider pt-6 text-sm">
          <Link to="/privacy" className="font-semibold text-primary hover:underline">Privacy policy</Link>
          <Link to="/delete-account" className="font-semibold text-primary hover:underline">Delete your account</Link>
          <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary hover:underline">{CONTACT_EMAIL}</a>
        </nav>
      </main>
    </div>
  )
}

export function Section({ title, items, children }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-ink">{title}</h2>
      {items && (
        <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-7 text-body">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      )}
      {children}
    </section>
  )
}
