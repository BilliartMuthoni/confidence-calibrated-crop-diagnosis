import { useCallback, useState } from 'react'

import { listAdvice, retireAdvice, saveAdvice } from '../api/admin.js'
import { useAuth } from '../auth/context.js'
import { Badge, Button, Card, Empty, ErrorBox, Field, Loading, PageHeader, filterClass, inputClass } from '../components/ui.jsx'
import { DISEASES, diseaseName, formatDate } from '../lib/format.js'
import { useLoad } from '../lib/useLoad.js'

const LICENCES = ['CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-SA 3.0', 'CC0', 'Public domain']
const BLANK = { disease: '', kind: 'treatment', text: '', source_title: '', source_url: '', licence: '' }
const isHealthy = (cls) => cls.endsWith('healthy')
// A disease needs both kinds of advice; a healthy result only needs prevention.
const needed = (cls) => (isHealthy(cls) ? ['prevention'] : ['treatment', 'prevention'])

/** Which classes a farmer could reach with no advice to show. */
function Coverage({ entries }) {
  const gaps = Object.keys(DISEASES).flatMap((cls) =>
    needed(cls).filter((kind) => !entries.some((a) => a.disease === cls && a.kind === kind && a.status === 'active'))
      .map((kind) => [cls, kind]))
  const total = Object.keys(DISEASES).reduce((sum, cls) => sum + needed(cls).length, 0)

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold text-ink">Missing advice</h2>
        <p className="text-sm text-muted">{total - gaps.length} of {total} covered</p>
      </div>
      {gaps.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Every result has the advice it needs.</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            A farmer who gets one of these results is shown the county contacts instead of advice.
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {gaps.map(([cls, kind]) => (
              <li key={`${cls}-${kind}`} className="rounded bg-attention-tint px-2 py-0.5 text-xs font-semibold text-attention-ink">
                {diseaseName(cls)}: {kind}
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}

function EntryForm({ initial, onDone, onCancel }) {
  const { token } = useAuth()
  const [form, setForm] = useState(initial)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })
  // Healthy results only get prevention advice.
  const setDisease = (e) => setForm({ ...form, disease: e.target.value, kind: isHealthy(e.target.value) ? 'prevention' : form.kind })
  const correcting = Boolean(initial.id)
  const ready = form.disease && form.text.trim() && form.source_title.trim() && /^https?:\/\//.test(form.source_url)
    && form.licence && note.trim().length >= 5

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await saveAdvice(token, form, note.trim())
      onDone()
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="text-base font-semibold text-ink">{correcting ? `Correct entry (now version ${initial.version})` : 'Add an advice entry'}</h2>
      <p className="mt-1 text-sm text-muted">
        Every entry is an excerpt copied word for word from a cited, openly licensed source, never advice written here.
        A correction saves a new version; farmers who already saw the old wording keep a record of it.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field label="Disease">
          <select className={inputClass} value={form.disease} onChange={setDisease} disabled={correcting}>
            <option value="">Choose a result</option>
            {Object.keys(DISEASES).map((c) => <option key={c} value={c}>{diseaseName(c)}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select className={inputClass} value={form.kind} onChange={set('kind')} disabled={isHealthy(form.disease)}>
            <option value="treatment">What to do now (treatment)</option>
            <option value="prevention">Stopping it coming back (prevention)</option>
          </select>
        </Field>
        <div className="sm:col-span-2">
          <Field label="Excerpt, exactly as published">
            <textarea className={`${inputClass} min-h-24`} value={form.text} onChange={set('text')} />
          </Field>
        </div>
        <Field label="Source title"><input className={inputClass} value={form.source_title} onChange={set('source_title')} /></Field>
        <Field label="Source link"><input className={inputClass} type="url" value={form.source_url} onChange={set('source_url')} placeholder="https://" /></Field>
        <Field label="Licence" hint="Only openly licensed sources can be shown to farmers.">
          <select className={inputClass} value={form.licence} onChange={set('licence')}>
            <option value="">Choose the source's licence</option>
            {LICENCES.map((l) => <option key={l}>{l}</option>)}
          </select>
        </Field>
        <Field label={correcting ? 'Why is it being corrected?' : 'Note for the change log'}
               hint={correcting ? 'For example: "copied wrongly, fixed to match the source".' : 'For example: "added from the Plantwise factsheet".'}>
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
      <div className="mt-4"><ErrorBox error={error} /></div>
      <div className="mt-4 flex gap-2">
        <Button onClick={save} busy={busy} disabled={!ready}>{correcting ? 'Save as new version' : 'Add entry'}</Button>
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </Card>
  )
}

function Entry({ entry, isAdmin, onEdit, onChanged }) {
  const { token } = useAuth()
  const [open, setOpen] = useState(false)

  const retire = async () => {
    const note = window.prompt('Why is this entry being retired? It stays in the history and is no longer shown to farmers.')
    if (!note?.trim()) return
    await retireAdvice(token, entry.id, note.trim())
    onChanged()
  }

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-ink">{entry.kind === 'treatment' ? 'Treatment' : 'Prevention'}</span>
        {entry.status === 'retired' && <Badge tone="retired">Retired</Badge>}
        <span className="text-xs text-muted">Version {entry.version}</span>
      </div>
      <p className={`mt-1.5 text-sm leading-6 ${entry.status === 'retired' ? 'text-muted line-through' : 'text-body'}`}>{entry.text}</p>
      <p className="mt-1 text-xs text-muted">
        Source: <a href={entry.source_url} target="_blank" rel="noreferrer" className="underline">{entry.source_title}</a> ({entry.licence})
      </p>
      <div className="mt-2 flex flex-wrap gap-3 text-sm">
        <button type="button" className="font-semibold text-muted underline" onClick={() => setOpen(!open)}>
          {open ? 'Hide history' : 'History'}
        </button>
        {isAdmin && entry.status === 'active' && (
          <>
            <button type="button" className="font-semibold text-primary underline" onClick={() => onEdit(entry)}>Correct</button>
            <button type="button" className="font-semibold text-attention-ink underline" onClick={retire}>Retire</button>
          </>
        )}
      </div>
      {open && (
        <ul className="mt-2 space-y-1 border-l-2 border-divider pl-3 text-xs text-muted">
          {entry.history.map((h, i) => (
            <li key={i}>Version {h.version} - {formatDate(h.at)} - {h.by}: {h.note}</li>
          ))}
        </ul>
      )}
    </li>
  )
}

export default function AdvicePage() {
  const { token, user } = useAuth()
  const isAdmin = user.role === 'admin'
  const load = useCallback(() => listAdvice(token), [token])
  const { data, error, loading, reload } = useLoad(load)
  const [editing, setEditing] = useState(null)
  const [disease, setDisease] = useState('')
  const [showRetired, setShowRetired] = useState(false)

  const entries = (data ?? []).filter((a) => !disease || a.disease === disease).filter((a) => showRetired || a.status === 'active')
  const groups = Object.keys(DISEASES).map((cls) => [cls, entries.filter((a) => a.disease === cls)]).filter(([, list]) => list.length)

  return (
    <>
      <PageHeader
        title="Advice library"
        subtitle="Treatment and prevention advice shown to farmers, word for word with its source. The assistant uses the same entries."
      >
        {isAdmin && !editing && <Button onClick={() => setEditing(BLANK)}>Add an entry</Button>}
      </PageHeader>

      {editing && (
        <EntryForm key={editing.id ?? 'new'} initial={editing} onCancel={() => setEditing(null)}
                   onDone={() => { setEditing(null); reload() }} />
      )}

      {data && <Coverage entries={data} />}

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <select className={filterClass} value={disease} onChange={(e) => setDisease(e.target.value)} aria-label="Disease">
          <option value="">All results</option>
          {Object.keys(DISEASES).map((c) => <option key={c} value={c}>{diseaseName(c)}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
          Show retired entries
        </label>
      </div>

      {loading ? <Loading /> : error ? <ErrorBox error={error} onRetry={reload} /> : groups.length === 0 ? (
        <Card><Empty title="No advice for this result yet">Until there is, farmers see the support contacts instead.</Empty></Card>
      ) : (
        <div className="space-y-6">
          {groups.map(([cls, list]) => (
            <Card key={cls} className="p-0">
              <h2 className="border-b border-divider px-5 py-3 font-semibold text-ink">{diseaseName(cls)}</h2>
              <ul className="divide-y divide-divider">
                {list.map((entry) => (
                  <Entry key={entry.id} entry={entry} isAdmin={isAdmin} onEdit={setEditing} onChanged={reload} />
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
