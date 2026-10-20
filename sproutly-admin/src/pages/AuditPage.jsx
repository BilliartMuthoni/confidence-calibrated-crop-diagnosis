import { useCallback, useState } from 'react'

import { listAudit } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Card, Empty, ErrorBox, Loading, PageHeader, inputClass } from '../components/ui.jsx'
import { AUDIT_ACTIONS, formatDate } from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'

// Groups for the filter; each action belongs to the group its name starts with.
const GROUPS = [
  ['sign', 'Sign-ins'],
  ['security', 'Own security changes'],
  ['referral', 'Referrals'],
  ['user', 'User accounts'],
  ['contact', 'Contacts'],
  ['advice', 'Advice library'],
]
const SECURITY = ['password_change', 'mfa_reenrol', 'backup_codes']
const groupOf = (action) => (SECURITY.includes(action) ? 'security' : action.split('_')[0])

// Read-only: the backend writes every entry and nobody can edit or delete one.
export default function AuditPage() {
  const { token } = useAuth()
  const load = useCallback(() => listAudit(token), [token])
  const { data, error, loading, reload } = useLoad(load)
  const [group, setGroup] = useState('')
  const [who, setWho] = useState('')

  const people = [...new Set((data ?? []).map((e) => e.who))].sort()
  const shown = (data ?? []).filter((e) => !group || groupOf(e.action) === group).filter((e) => !who || e.who === who)

  return (
    <>
      <PageHeader
        title="Audit log"
        subtitle="Who did what, and when: sign-ins, replies, account changes, contact and advice edits. Entries cannot be edited or deleted."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <select className={`${inputClass} w-auto`} value={group} onChange={(e) => setGroup(e.target.value)} aria-label="Kind of action">
          <option value="">All actions</option>
          {GROUPS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select className={`${inputClass} w-auto`} value={who} onChange={(e) => setWho(e.target.value)} aria-label="Person">
          <option value="">Everyone</option>
          {people.map((p) => <option key={p}>{p}</option>)}
        </select>
      </div>

      {loading ? <Loading /> : error ? <ErrorBox error={error} onRetry={reload} /> : shown.length === 0 ? (
        <Card><Empty>Nothing recorded for this filter.</Empty></Card>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-divider text-xs uppercase tracking-wider text-faint">
              <tr>
                <th className="px-5 py-3 font-semibold">When</th>
                <th className="px-5 py-3 font-semibold">Who</th>
                <th className="px-5 py-3 font-semibold">What</th>
                <th className="px-5 py-3 font-semibold">On</th>
                <th className="px-5 py-3 font-semibold">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {shown.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-5 py-3 tabular-nums text-muted">{formatDate(e.at)}</td>
                  <td className="px-5 py-3 text-body">{e.who}</td>
                  <td className={`px-5 py-3 ${e.action === 'sign_in_failed' ? 'font-semibold text-attention' : 'text-ink'}`}>
                    {AUDIT_ACTIONS[e.action] ?? e.action}
                  </td>
                  <td className="px-5 py-3 text-body">{e.target}</td>
                  <td className="px-5 py-3 text-muted">{e.detail || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}
