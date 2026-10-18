import { useCallback, useState } from 'react'

import { listContacts, markContactChecked, saveContact, setContactActive } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, PageHeader, inputClass } from '../components/ui.jsx'
import { CONTACT_KINDS, COUNTIES, daysSince } from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'

const BLANK = { county: '', kind: 'office', name: '', role: '', organisation: 'County Department of Agriculture', phone: '', email: '', hours: '' }
// Phone numbers and office hours go out of date; after this long a contact is flagged for a call.
const STALE_DAYS = 180

function Checked({ value }) {
  const days = daysSince(value)
  const label = days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`
  return days > STALE_DAYS
    ? <span className="font-semibold text-attention">{label}, check again</span>
    : <span className="text-muted">{label}</span>
}

function ContactForm({ initial, onDone, onCancel }) {
  const { token } = useAuth()
  const [form, setForm] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  const ready = form.county && form.name.trim() && form.role.trim() && form.phone.trim() && form.hours.trim()

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await saveContact(token, { ...form, email: form.email?.trim() || null })
      onDone()
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-4 font-bold text-ink">{initial.id ? 'Edit contact' : 'Add a contact'}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="County">
          <select className={inputClass} value={form.county} onChange={set('county')}>
            <option value="">Choose a county</option>
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
          <input className={inputClass} value={form.phone} onChange={set('phone')} />
        </Field>
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

  const checked = async (contact) => {
    await markContactChecked(token, contact.id)
    reload()
  }

  const shown = (data ?? []).filter((c) => !county || c.county === county).filter((c) => isAdmin || c.active)
  const stale = shown.filter((c) => c.active && daysSince(c.checked_on) > STALE_DAYS).length

  return (
    <>
      <PageHeader
        title="County contacts"
        subtitle="Who farmers are shown when a case is referred: the Support contacts screen in the app lists the contacts for the farmer's county."
      >
        {isAdmin && !editing && <Button onClick={() => setEditing(BLANK)}>Add a contact</Button>}
      </PageHeader>

      {editing && (
        <ContactForm key={editing.id ?? 'new'} initial={editing} onCancel={() => setEditing(null)}
                     onDone={() => { setEditing(null); reload() }} />
      )}

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <select className={`${inputClass} w-auto`} value={county} onChange={(e) => setCounty(e.target.value)} aria-label="County">
          <option value="">All counties</option>
          {COUNTIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        {isAdmin && stale > 0 && (
          <p className="text-sm font-semibold text-attention">
            {stale} shown {stale === 1 ? 'contact has' : 'contacts have'} not been checked for over 6 months.
          </p>
        )}
      </div>

      {loading ? <Loading /> : error ? <ErrorBox error={error} onRetry={reload} /> : shown.length === 0 ? (
        <Card><Empty>No contacts for this county yet. Farmers there are shown the general advice to visit the county agriculture office.</Empty></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-divider text-xs uppercase tracking-wider text-faint">
              <tr>
                <th className="px-5 py-3 font-semibold">County</th>
                <th className="px-5 py-3 font-semibold">Contact</th>
                <th className="px-5 py-3 font-semibold">How to reach</th>
                <th className="px-5 py-3 font-semibold">Last checked</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                {isAdmin && <th className="px-5 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {shown.map((c) => (
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
                    {c.email && <span className="block text-muted">{c.email}</span>}
                    <span className="block text-muted">{c.hours}</span>
                  </td>
                  <td className="px-5 py-3"><Checked value={c.checked_on} /></td>
                  <td className="px-5 py-3"><Badge tone={c.active ? 'active' : 'inactive'}>{c.active ? 'shown' : 'hidden'}</Badge></td>
                  {isAdmin && (
                    <td className="px-5 py-3 text-right">
                      <div className="flex flex-col items-end gap-1 whitespace-nowrap">
                        <button type="button" className="font-semibold text-primary underline" onClick={() => checked(c)}>Mark checked</button>
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
        </Card>
      )}
    </>
  )
}
