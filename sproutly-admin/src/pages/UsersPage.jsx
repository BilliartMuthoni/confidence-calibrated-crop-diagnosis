import { Fragment, useCallback, useState } from 'react'

import { createOfficer, listUsers, resetAuthenticator, resetPassword, setOfficerCounty, setUserActive } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, PageHeader, Pagination, SortHeader, filterClass, inputClass } from '../components/ui.jsx'
import { COUNTIES, parseUtc, timeAgo } from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'
import { usePaged } from '../lib/usePaged.js'

const ROLE_LABEL = { admin: 'Administrator', officer: 'Extension officer', farmer: 'Farmer' }

/** A one-time link for the staff member, shown once for the admin to pass on (no email service yet). */
function OneTimeLink({ result, who }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(result.link)
      setCopied(true)
    } catch {
      // Clipboard blocked: the link can still be selected by hand.
    }
  }
  return (
    <div className="rounded-md border border-healthy-ink/25 bg-healthy-tint p-4">
      <p className="text-sm font-semibold text-ink">Send this link to {who}. It works once, for {result.expires_in_hours} hours.</p>
      <p className="mt-2 break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-body select-all">{result.link}</p>
      <div className="mt-2 flex items-center gap-3">
        <Button variant="secondary" onClick={copy}>Copy link</Button>
        {copied && <span className="text-sm text-healthy-ink">Copied</span>}
      </div>
      <p className="mt-2 text-xs text-faint">Send it to a number or address you know is theirs, never one given in the same request.</p>
    </div>
  )
}

// The help the sign-in page promises ("ask your administrator"): a new password link, a new
// authenticator for a lost phone, and moving an officer to another county.
function Manage({ user, onDone }) {
  const { token } = useAuth()
  const [county, setCounty] = useState(user.county ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState('')
  const [link, setLink] = useState(null)

  const act = async (question, action, message) => {
    if (question && !window.confirm(question)) return
    setBusy(true)
    setError(null)
    setLink(null)
    try {
      const result = await action()
      setDone(message)
      if (result?.link) setLink(result)
      onDone()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4 bg-surface px-5 py-4">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" busy={busy}
                onClick={() => act(`Reset ${user.name}'s password? Their current password stops working now.`,
                  () => resetPassword(token, user.id), 'Password reset.')}>
          Reset password
        </Button>
        <Button variant="secondary" busy={busy}
                onClick={() => act(`Reset ${user.name}'s authenticator? Use this for a lost phone. Their password is reset too, and they set up a new authenticator at their next sign-in.`,
                  () => resetAuthenticator(token, user.id), 'Authenticator and password reset.')}>
          Reset authenticator
        </Button>
      </div>
      {user.role === 'officer' && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="County">
            <select className={filterClass} value={county} onChange={(e) => setCounty(e.target.value)}>
              {COUNTIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Field>
          <Button variant="secondary" busy={busy} disabled={county === user.county}
                  onClick={() => act(null, () => setOfficerCounty(token, user.id, county), `${user.name} now sees ${county}'s referrals.`)}>
            Move to this county
          </Button>
        </div>
      )}
      <p className="text-xs text-faint">Each of these is recorded in the audit log.</p>
      <ErrorBox error={error} />
      {done && <p className="text-sm font-semibold text-healthy-ink">{done}</p>}
      {link && <OneTimeLink result={link} who={user.name} />}
    </div>
  )
}

function NewOfficer({ onDone, onCancel }) {
  const { token } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', county: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [created, setCreated] = useState(null)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      setCreated(await createOfficer(token, { ...form, email: form.email.trim().toLowerCase() }))
      onDone()
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  if (created) {
    return (
      <Card className="mb-6 space-y-4">
        <h2 className="text-base font-semibold text-ink">{created.user.name}'s account is ready</h2>
        <OneTimeLink result={created} who={created.user.name} />
        <Button variant="secondary" onClick={onCancel}>Done</Button>
      </Card>
    )
  }

  return (
    <Card className="mb-6">
      <h2 className="text-base font-semibold text-ink">Create an officer account</h2>
      <p className="mt-1 text-sm text-muted">
        You get a one-time link to pass on. With it they choose a password, then set up an authenticator app. They see
        only their county's referrals.
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
  const { token } = useAuth()
  const load = useCallback(() => listUsers(token), [token])
  const { data, error, loading, reload } = useLoad(load)
  const [creating, setCreating] = useState(false)
  const [role, setRole] = useState('')
  const [search, setSearch] = useState('')
  const [managing, setManaging] = useState(null)

  const toggle = async (u) => {
    const verb = u.active ? 'Deactivate' : 'Reactivate'
    const effect = u.active ? 'They can no longer sign in; their records are kept.' : 'They can sign in again.'
    if (!window.confirm(`${verb} ${u.name}? ${effect}`)) return
    await setUserActive(token, u.id, !u.active)
    reload()
  }

  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })
  // Never signed in counts as the oldest sign-in.
  const signedIn = (u) => (u.last_sign_in ? parseUtc(u.last_sign_in).getTime() : 0)
  const compare = sort.key === 'last' ? (a, b) => signedIn(a) - signedIn(b) : (a, b) => a.name.localeCompare(b.name)

  const q = search.trim().toLowerCase()
  const shown = (data ?? [])
    .filter((u) => !role || u.role === role)
    .filter((u) => !q || u.name.toLowerCase().includes(q) || (u.contact ?? '').toLowerCase().includes(q))
    .sort((a, b) => (sort.dir === 'asc' ? compare(a, b) : compare(b, a)))
  const paged = usePaged(shown, `${role}|${q}|${sort.key}|${sort.dir}`)

  return (
    <>
      <PageHeader title="Users" subtitle="Officers, administrators and farmers. Every account uses an authenticator code.">
        {!creating && <Button onClick={() => setCreating(true)}>Create an officer account</Button>}
      </PageHeader>

      {creating && <NewOfficer onCancel={() => setCreating(false)} onDone={reload} />}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input className={`${inputClass} max-w-72`} type="search" value={search} onChange={(e) => setSearch(e.target.value)}
               placeholder="Search by name, email or phone" aria-label="Search users" />
        <div role="group" aria-label="Role" className="inline-flex overflow-hidden rounded-md border border-divider-strong bg-white">
          {[['', 'All'], ['officer', 'Officers'], ['admin', 'Admins'], ['farmer', 'Farmers']].map(([value, label]) => (
            <button key={label} type="button" aria-pressed={role === value} onClick={() => setRole(value)}
                    className={`h-9 border-r border-divider px-3 text-sm font-semibold last:border-r-0 ${
                      role === value ? 'bg-healthy-tint text-primary' : 'text-muted hover:bg-neutral-tint hover:text-ink'
                    }`}>
              {label}
            </button>
          ))}
        </div>
        {data && <span className="ml-auto text-xs text-muted tabular-nums">{shown.length} of {data.length}</span>}
      </div>

      {loading ? <Loading /> : error ? <ErrorBox error={error} onRetry={reload} /> : shown.length === 0 ? (
        <Card>
          <Empty title="No users match" action={<Button variant="secondary" onClick={() => { setSearch(''); setRole('') }}>Clear filters</Button>}>
            Try another name, or show every role.
          </Empty>
        </Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-divider bg-surface/60 text-xs text-muted">
              <tr>
                <SortHeader label="Name" column="name" sort={sort} onSort={setSort} className="px-5 py-2.5" />
                <th className="px-5 py-2.5 font-semibold">Role</th>
                <th className="px-5 py-2.5 font-semibold">Authenticator</th>
                <SortHeader label="Last sign-in" column="last" sort={sort} onSort={setSort} className="px-5 py-2.5" />
                <th className="px-5 py-2.5 font-semibold">Status</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {paged.rows.map((u) => (
                <Fragment key={u.id}>
                  <tr>
                    <td className="px-5 py-3">
                      <span className="block font-semibold text-ink">{u.name}</span>
                      <span className="block text-muted">{u.contact} - joined {timeAgo(u.created_at)}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="block text-body">{ROLE_LABEL[u.role]}</span>
                      {u.county && <span className="block text-muted">{u.county}</span>}
                    </td>
                    <td className="px-5 py-3">
                      {u.mfa ? <span className="text-body">Set up</span> : <Badge>At next sign-in</Badge>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3 text-muted">{u.last_sign_in ? timeAgo(u.last_sign_in) : 'Never'}</td>
                    <td className="px-5 py-3">{u.active ? <span className="text-body">Active</span> : <Badge>Deactivated</Badge>}</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex flex-col items-end gap-1 whitespace-nowrap">
                        {u.role === 'officer' && (
                          <button type="button" className="font-semibold text-primary underline"
                                  onClick={() => setManaging(managing === u.id ? null : u.id)}>
                            {managing === u.id ? 'Close' : 'Manage'}
                          </button>
                        )}
                        {u.role !== 'admin' && (
                          <button type="button" className="font-semibold text-muted underline" onClick={() => toggle(u)}>
                            {u.active ? 'Deactivate' : 'Reactivate'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {managing === u.id && (
                    <tr><td colSpan={6} className="p-0"><Manage user={u} onDone={reload} /></td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          <Pagination paged={paged} />
        </Card>
      )}
    </>
  )
}
