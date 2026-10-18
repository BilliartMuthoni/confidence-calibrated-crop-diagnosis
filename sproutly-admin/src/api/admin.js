// Every call the portal makes. With VITE_USE_SAMPLE_DATA (on unless set to "false") the
// answers come from sampleData.js, so the pages work before the admin API exists; the
// real calls below are the endpoints the backend will provide (issue: admin and officer API).

import { apiFetch, ApiError } from './client.js'
import { SAMPLE_ACCOUNTS, SAMPLE_PASSWORD, sampleStore } from './sampleData.js'

export const USE_SAMPLE_DATA = import.meta.env.VITE_USE_SAMPLE_DATA !== 'false'

const store = sampleStore()
const pause = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms))
const nextId = (items) => Math.max(0, ...items.map((item) => item.id)) + 1
const now = () => new Date().toISOString()

function sampleUser(token) {
  const email = token?.replace(/^sample:/, '')
  const account = SAMPLE_ACCOUNTS[email]
  if (!account) throw new ApiError(401, 'Please log in again.')
  return { ...account, email }
}

// ------------------------------------------------------------------------- sign-in

export async function login(email, password) {
  if (!USE_SAMPLE_DATA) {
    return apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })
  }
  await pause()
  const account = SAMPLE_ACCOUNTS[email.trim().toLowerCase()]
  if (!account || password !== SAMPLE_PASSWORD) throw new ApiError(401, 'Invalid credentials')
  return {
    next_step: account.needsSetup ? 'setup' : 'verify',
    mfa_token: `sample:${email.trim().toLowerCase()}`,
    expires_in_minutes: 5,
    setup: account.needsSetup ? { secret: 'SAMPLE SETUP KEY', qr_code: null } : null,
  }
}

// Second step: the authenticator code. Returns the session (token + who is signed in).
export async function submitCode(step, mfaToken, code) {
  if (!USE_SAMPLE_DATA) {
    const path = step === 'setup' ? '/auth/mfa/setup/confirm' : '/auth/mfa/verify'
    const tokens = await apiFetch(path, { method: 'POST', body: JSON.stringify({ mfa_token: mfaToken, code }) })
    const me = await apiFetch('/auth/me', { token: tokens.access_token })
    return { token: tokens.access_token, user: { ...me, role: tokens.role } }
  }
  await pause()
  if (!/^\d{6}$/.test(code)) throw new ApiError(400, 'Code must be the 6 digits shown in your authenticator app')
  return { token: mfaToken, user: sampleUser(mfaToken) }
}

// ------------------------------------------------------------------------ overview

export async function getOverview(token) {
  if (!USE_SAMPLE_DATA) return apiFetch('/admin/overview', { token })
  await pause()
  const waiting = store.referrals.filter((r) => r.status === 'waiting').length
  return { ...store.overview, waiting_referrals: waiting }
}

// ----------------------------------------------------------------------- referrals

// Officers only ever receive their own county's cases; the backend enforces this too.
export async function listReferrals(token, { status, county } = {}) {
  if (!USE_SAMPLE_DATA) {
    const query = new URLSearchParams(Object.entries({ status, county }).filter(([, v]) => v))
    return apiFetch(`/admin/referrals?${query}`, { token })
  }
  await pause()
  const user = sampleUser(token)
  return store.referrals
    .filter((r) => user.role === 'admin' || r.county === user.county)
    .filter((r) => !status || r.status === status)
    .filter((r) => !county || r.county === county)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
}

export async function getReferral(token, id) {
  if (!USE_SAMPLE_DATA) return apiFetch(`/admin/referrals/${id}`, { token })
  const found = (await listReferrals(token)).find((r) => r.id === Number(id))
  if (!found) throw new ApiError(404, 'Referral not found')
  return found
}

export async function replyToReferral(token, id, { text, correctDisease }) {
  if (!USE_SAMPLE_DATA) {
    return apiFetch(`/admin/referrals/${id}/reply`, {
      method: 'POST', token, body: JSON.stringify({ text, correct_disease: correctDisease || null }),
    })
  }
  const referral = await getReferral(token, id)
  if (referral.status !== 'waiting') throw new ApiError(400, 'This referral has already been answered or has expired')
  referral.status = 'answered'
  referral.reply = { text, correct_disease: correctDisease || null, officer: sampleUser(token).name, replied_at: now() }
  return referral
}

// ------------------------------------------------------------------------ contacts

export async function listContacts(token) {
  if (!USE_SAMPLE_DATA) return apiFetch('/admin/contacts', { token })
  await pause()
  return [...store.contacts].sort((a, b) => a.county.localeCompare(b.county) || a.name.localeCompare(b.name))
}

export async function saveContact(token, contact) {
  if (!USE_SAMPLE_DATA) {
    const path = contact.id ? `/admin/contacts/${contact.id}` : '/admin/contacts'
    return apiFetch(path, { method: contact.id ? 'PUT' : 'POST', token, body: JSON.stringify(contact) })
  }
  await pause()
  if (contact.id) {
    Object.assign(store.contacts.find((c) => c.id === contact.id), contact)
    return contact
  }
  const created = { ...contact, id: nextId(store.contacts), active: true }
  store.contacts.push(created)
  return created
}

export async function setContactActive(token, id, active) {
  if (!USE_SAMPLE_DATA) {
    return apiFetch(`/admin/contacts/${id}/active`, { method: 'POST', token, body: JSON.stringify({ active }) })
  }
  await pause()
  store.contacts.find((c) => c.id === id).active = active
}

// --------------------------------------------------------------------------- users

export async function listUsers(token) {
  if (!USE_SAMPLE_DATA) return apiFetch('/admin/users', { token })
  await pause()
  return [...store.users]
}

export async function setUserActive(token, id, active) {
  if (!USE_SAMPLE_DATA) {
    return apiFetch(`/admin/users/${id}/active`, { method: 'POST', token, body: JSON.stringify({ active }) })
  }
  await pause()
  store.users.find((u) => u.id === id).active = active
}

// Officers never sign themselves up: the admin creates the account, and the officer sets
// up the authenticator app at first login.
export async function createOfficer(token, { name, email, county }) {
  if (!USE_SAMPLE_DATA) {
    return apiFetch('/admin/users/officers', { method: 'POST', token, body: JSON.stringify({ name, email, county }) })
  }
  await pause()
  if (store.users.some((u) => u.contact === email)) throw new ApiError(400, 'An account with this email already exists')
  const created = { id: nextId(store.users), name, contact: email, role: 'officer', county, mfa: false, active: true, created_at: now() }
  store.users.push(created)
  return created
}

// -------------------------------------------------------------------------- advice

export async function listAdvice(token) {
  if (!USE_SAMPLE_DATA) return apiFetch('/admin/advice', { token })
  await pause()
  return [...store.advice]
}

// A correction creates a new version; the old wording stays in the history, and each
// diagnosis keeps the version the farmer was shown.
export async function saveAdvice(token, entry, note) {
  if (!USE_SAMPLE_DATA) {
    const path = entry.id ? `/admin/advice/${entry.id}` : '/admin/advice'
    return apiFetch(path, { method: entry.id ? 'PUT' : 'POST', token, body: JSON.stringify({ ...entry, note }) })
  }
  await pause()
  const by = sampleUser(token).name
  if (entry.id) {
    const existing = store.advice.find((a) => a.id === entry.id)
    const version = existing.version + 1
    Object.assign(existing, entry, { version, history: [...existing.history, { version, at: now(), by, note }] })
    return existing
  }
  const created = { ...entry, id: nextId(store.advice), version: 1, status: 'active', history: [{ version: 1, at: now(), by, note }] }
  store.advice.push(created)
  return created
}

export async function retireAdvice(token, id, note) {
  if (!USE_SAMPLE_DATA) {
    return apiFetch(`/admin/advice/${id}/retire`, { method: 'POST', token, body: JSON.stringify({ note }) })
  }
  await pause()
  const entry = store.advice.find((a) => a.id === id)
  entry.status = 'retired'
  entry.history = [...entry.history, { version: entry.version, at: now(), by: sampleUser(token).name, note: `Retired: ${note}` }]
}

// --------------------------------------------------------------------------- model

export async function getModelSettings(token) {
  if (!USE_SAMPLE_DATA) return apiFetch('/admin/model', { token })
  await pause()
  return store.model
}
