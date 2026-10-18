import { useCallback, useState } from 'react'

import { createOfficer, listUsers, setUserActive } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Badge, Button, Card, ErrorBox, Field, Loading, PageHeader, inputClass } from '../components/ui.jsx'
import { COUNTIES, timeAgo } from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'

const ROLE_LABEL = { admin: 'Administrator', officer: 'Extension officer', farmer: 'Farmer' }

function NewOfficer({ onDone, onCancel }) {
  const { token } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', county: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await createOfficer(token, { ...form, email: form.email.trim().toLowerCase() })
      onDone()
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="font-bold text-ink">Create an officer account</h2>
      <p className="mt-1 text-sm leading-6 text-muted">
        Officers cannot sign themselves up. They receive a one-time sign-in link by email, choose a password and set up an
        authenticator app at their first sign-in. They see only their county's referrals.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Field label="Full name"><input className={inputClass} value={form.name} onChange={set('name')} /></Field>
        <Field label="Work email"><input className={inputClass} type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="County">
          <select className={inputClass} value={form.county} onChange={set('county')}>
            <option value="">Choose a county</option>
            {COUNTIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-4"><ErrorBox error={error} /></div>
      <div className="mt-4 flex gap-2">
        <Button onClick={save} busy={busy} disabled={!form.name.trim() || !form.email.includes('@') || !form.county}>
          Create account
        </Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  )
}

export default function UsersPage() {
  const { token, user: me } = useAuth()
  const load = useCallback(() => listUsers(token), [token])
  const { data, error, loading, reload } = useLoad(load)
  const [creating, setCreating] = useState(false)
  const [role, setRole] = useState('')

  const toggle = async (u) => {
    await setUserActive(token, u.id, !u.active)
    reload()
  }

  const shown = (data ?? []).filter((u) => !role || u.role === role)

  return (
    <>
      <PageHeader
        title="Users"
        subtitle="Every account has the authenticator code switched on. Deactivating an account stops it signing in; its records are kept."
      >
        {!creating && <Button onClick={() => setCreating(true)}>Create an officer account</Button>}
      </PageHeader>

      {creating && <NewOfficer onCancel={() => setCreating(false)} onDone={() => { setCreating(false); reload() }} />}

      <div className="mb-4">
        <select className={`${inputClass} w-auto`} value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
          <option value="">All roles</option>
          <option value="admin">Administrators</option>
          <option value="officer">Extension officers</option>
          <option value="farmer">Farmers</option>
        </select>
      </div>

      {loading ? <Loading /> : error ? <ErrorBox error={error} onRetry={reload} /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-divider text-xs uppercase tracking-wider text-faint">
              <tr>
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">Role</th>
                <th className="px-5 py-3 font-semibold">County</th>
                <th className="px-5 py-3 font-semibold">Authenticator</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {shown.map((u) => (
                <tr key={u.id}>
                  <td className="px-5 py-3">
                    <span className="block font-semibold text-ink">{u.name}</span>
                    <span className="block text-muted">{u.contact} - joined {timeAgo(u.created_at)}</span>
                  </td>
                  <td className="px-5 py-3 text-body">{ROLE_LABEL[u.role]}</td>
                  <td className="px-5 py-3 text-body">{u.county ?? '-'}</td>
                  <td className="px-5 py-3">
                    <Badge tone={u.mfa ? 'active' : 'waiting'}>{u.mfa ? 'set up' : 'at first sign-in'}</Badge>
                  </td>
                  <td className="px-5 py-3"><Badge tone={u.active ? 'active' : 'inactive'}>{u.active ? 'active' : 'deactivated'}</Badge></td>
                  <td className="px-5 py-3 text-right">
                    {u.id !== me.id && (
                      <button type="button" className="font-semibold text-muted underline" onClick={() => toggle(u)}>
                        {u.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}
