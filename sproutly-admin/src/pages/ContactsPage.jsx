import { useCallback, useState } from 'react'

import { listContacts, markContactChecked, saveContact, setContactActive } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, PageHeader, Pagination, filterClass, inputClass } from '../components/ui.jsx'
import { CONTACT_KINDS, COUNTIES, NATIONWIDE, daysSince, parseUtc } from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'
import { usePaged } from '../lib/usePaged.js'

const BLANK = {
  county: '', kind: 'office', name: '', role: '', organisation: 'County Department of Agriculture', phone: '',
  phone_type: 'office', email: '', hours: '',
}
// Role numbers first: they outlive staff changes and are not one person's personal data.
const PHONE_TYPES = {
  office: 'Office line',
  hotline: 'Hotline',
  business: 'Business line',
  personal: "Someone's personal mobile",
}
// Phone numbers and office hours go out of date; after this long a contact is flagged for a call.
const STALE_DAYS = 180

function Checked({ value }) {
  const days = daysSince(value)
  const label = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
  return days > STALE_DAYS
    ? <span className="font-semibold text-attention-ink">{label}, check again</span>
    : <span className="text-muted">{label}</span>
}

function ContactForm({ initial, onDone, onCancel }) {
  const { token } = useAuth()
  const [form, setForm] = useState(initial)
  // Consent already on record stays unless the number changes; a new personal number needs it again.
  const [consent, setConsent] = useState(Boolean(initial.personal_consent_on))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const personal = form.phone_type === 'personal'
  const ready = form.county && form.name.trim() && form.role.trim() && form.phone.trim() && form.hours.trim()
    && (!personal || consent)

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await saveContact(token, { ...form, email: form.email?.trim() || null, personal_consent: personal && consent })
      onDone()
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-4 font-semibold text-ink">{initial.id ? 'Edit contact' : 'Add a contact'}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="County">
          <select className={inputClass} value={form.county} onChange={set('county')}>
            <option value="">Choose a county</option>
            <option value={NATIONWIDE}>Nationwide (every county)</option>
            {COUNTIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select className={inputClass} value={form.kind} onChange={set('kind')}>
            {Object.entries(CONTACT_KINDS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        <Field label="Name" hint="A person, office or plant clinic.">
          <input className={inputClass} value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Role">
          <input className={inputClass} value={form.role} onChange={set('role')} placeholder="Ward Agricultural Extension Officer" />
        </Field>
        <Field label="Organisation">
          <input className={inputClass} value={form.organisation} onChange={set('organisation')} />
        </Field>
        <Field label="Phone">
          <input className={inputClass} value={form.phone} onChange={(e) => { set('phone')(e); if (personal) setConsent(false) }} />
        </Field>
        <Field label="What kind of number is it?" hint="Prefer an office line or hotline: it keeps working when staff change.">
          <select className={inputClass} value={form.phone_type} onChange={(e) => { set('phone_type')(e); setConsent(false) }}>
            {Object.entries(PHONE_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </Field>
        {personal && (
          <label className="flex gap-3 rounded-md border border-attention-ink/25 bg-attention-tint px-4 py-3 text-sm sm:col-span-2">
            <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span className="text-body">
              <span className="font-semibold text-ink">
                This person agreed to have their own mobile shown to farmers {form.county === NATIONWIDE ? 'in every county' : `in ${form.county || 'this county'}`}.
              </span>{' '}
              They were told why, and that they can withdraw at any time (then change it to an office line or hide the
              contact). Today's date and your name are recorded (Data Protection Act 2019, s.30 and s.32).
            </span>
          </label>
        )}
        <Field label="Email (optional)">
          <input className={inputClass} type="email" value={form.email ?? ''} onChange={set('email')} />
        </Field>
        <Field label="Opening hours" hint="When a farmer can call or walk in.">
          <input className={inputClass} value={form.hours} onChange={set('hours')} placeholder="Mon-Fri, 8am-5pm" />
        </Field>
      </div>
      <p className="mt-3 text-xs text-faint">Saving records today as the date these details were last checked.</p>
      <div className="mt-4"><ErrorBox error={error} /></div>
      <div className="mt-4 flex gap-2">
        <Button onClick={save} busy={busy} disabled={!ready}>Save</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  )
}

export default function ContactsPage() {
  const { token, user } = useAuth()
  const isAdmin = user.role === 'admin'
  const load = useCallback(() => listContacts(token), [token])
  const { data, error, loading, reload } = useLoad(load)
  const [editing, setEditing] = useState(null)
  const [county, setCounty] = useState(isAdmin ? '' : user.county)

  const toggle = async (contact) => {
    await setContactActive(token, contact.id, !contact.active)
    reload()
  }

  // Which row is saving a check, and which one failed: the click must always show something.
  const [checking, setChecking] = useState(null)
  const [checkFailed, setCheckFailed] = useState(null)

  const checked = async (contact) => {
    setChecking(contact.id)
    setCheckFailed(null)
    try {
      await markContactChecked(token, contact.id)
      reload()
    } catch {
      setCheckFailed(contact.id)
    } finally {
      setChecking(null)
    }
  }

  const shown = (data ?? []).filter((c) => !county || c.county === county).filter((c) => isAdmin || c.active)
  const paged = usePaged(shown, county)
  const stale = shown.filter((c) => c.active && daysSince(c.checked_on) > STALE_DAYS).length

  return (
    <>
      <PageHeader
        title="County contacts"
        subtitle="Shown to farmers on the app's Support contacts screen: nationwide ones to everyone, then their county's."
      >
        {isAdmin && !editing && <Button onClick={() => setEditing(BLANK)}>Add a contact</Button>}
      </PageHeader>

      {editing && (
        <ContactForm key={editing.id ?? 'new'} initial={editing} onCancel={() => setEditing(null)}
                     onDone={() => { setEditing(null); reload() }} />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <select className={filterClass} value={county} onChange={(e) => setCounty(e.target.value)} aria-label="County">
          <option value="">All counties</option>
          <option value={NATIONWIDE}>Nationwide</option>
          {COUNTIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        {isAdmin && stale > 0 && (
          <p className="text-sm font-semibold text-attention-ink">
            {stale} shown {stale === 1 ? 'contact has' : 'contacts have'} not been checked for over 6 months.
          </p>
        )}
      </div>

      {loading ? <Loading /> : error ? <ErrorBox error={error} onRetry={reload} /> : shown.length === 0 ? (
        <Card><Empty title="No contacts for this county yet">Farmers there are told to visit the county agriculture office.</Empty></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-divider bg-surface/60 text-xs text-muted">
              <tr>
                <th className="px-5 py-2.5 font-semibold">County</th>
                <th className="px-5 py-2.5 font-semibold">Contact</th>
                <th className="px-5 py-2.5 font-semibold">How to reach</th>
                <th className="px-5 py-2.5 font-semibold">Last checked</th>
                <th className="px-5 py-2.5 font-semibold">Status</th>
                {isAdmin && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {paged.rows.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-3">
                    <span className="block text-body">{c.county}</span>
                    <span className="block text-muted">{CONTACT_KINDS[c.kind]}</span>
                  </td>
                  <td className="min-w-56 px-5 py-3">
                    <span className="block font-semibold text-ink">{c.name}</span>
                    <span className="block text-muted">{c.role}, {c.organisation}</span>
                  </td>
                  <td className="min-w-48 px-5 py-3 text-body">
                    {c.phone}
                    <span className={`block text-xs ${c.phone_type === 'personal' ? 'text-attention-ink' : 'text-faint'}`}>
                      {PHONE_TYPES[c.phone_type] ?? 'Office line'}
                      {c.personal_consent_on && `, consent ${parseUtc(c.personal_consent_on).toLocaleDateString()}`}
                    </span>
                    {c.email && <span className="block text-muted">{c.email}</span>}
                    <span className="block text-muted">{c.hours}</span>
                  </td>
                  <td className="px-5 py-3"><Checked value={c.checked_on} /></td>
                  <td className="px-5 py-3">{c.active ? <span className="text-body">Shown</span> : <Badge>Hidden</Badge>}</td>
                  {isAdmin && (
                    <td className="px-5 py-3 text-right">
                      <div className="flex flex-col items-end gap-1 whitespace-nowrap">
                        {daysSince(c.checked_on) === 0 ? (
                          <span className="font-semibold text-healthy-ink">Checked today</span>
                        ) : (
                          <button type="button" className="font-semibold text-primary underline disabled:opacity-50"
                                  disabled={checking === c.id} onClick={() => checked(c)}>
                            {checking === c.id ? 'Saving…' : 'Mark checked'}
                          </button>
                        )}
                        {checkFailed === c.id && <span role="alert" className="text-xs text-attention-ink">Couldn't save. Try again.</span>}
                        <button type="button" className="font-semibold text-primary underline" onClick={() => setEditing(c)}>Edit</button>
                        <button type="button" className="font-semibold text-muted underline" onClick={() => toggle(c)}>
                          {c.active ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination paged={paged} />
        </Card>
      )}
    </>
  )
}
