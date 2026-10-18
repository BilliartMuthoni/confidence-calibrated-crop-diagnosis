// Every call the portal makes to the backend (sproutly-backend/app/routers/admin.py,
// admin_content.py and auth.py). The backend checks the role, and an officer's county,
// on every request; the portal only hides what a role cannot use.

import { API_URL, apiFetch, ApiError } from './client.js'

const post = (body) => ({ method: 'POST', body: JSON.stringify(body) })

// ------------------------------------------------------------------------- sign-in

export function login(email, password) {
  return apiFetch('/auth/login', post({ email, password }))
}

// The portal's picture of who is signed in, from the backend's /auth/me.
async function session(tokens) {
  const me = await apiFetch('/auth/me', { token: tokens.access_token })
  return {
    token: tokens.access_token,
    user: { id: me.user_id, name: me.full_name || me.user_email, role: tokens.role, county: me.county, email: me.user_email },
  }
}

// Second step: the authenticator code. Returns the session (token + who is signed in).
export async function submitCode(step, mfaToken, code) {
  const path = step === 'setup' ? '/auth/mfa/setup/confirm' : '/auth/mfa/verify'
  return session(await apiFetch(path, post({ mfa_token: mfaToken, code })))
}

// Second step with a backup code instead of the phone (each code works once).
export async function submitBackupCode(mfaToken, code) {
  return session(await apiFetch('/auth/mfa/backup', post({ mfa_token: mfaToken, code })))
}

// A staff member chooses a password from a one-time invite or reset link.
export function setStaffPassword(linkToken, password) {
  return apiFetch('/auth/staff/password', post({ token: linkToken, password }))
}

// ---------------------------------------------------------------------- my account

export function getMyAccount(token) {
  return apiFetch('/auth/account', { token })
}

export function changePassword(token, current, next) {
  return apiFetch('/auth/password', { token, ...post({ current_password: current, new_password: next }) })
}

// Moving to a new phone: a code from the current app first, then scan a new key.
export function startAuthenticatorReset(token, code) {
  return apiFetch('/auth/mfa/reenrol/start', { token, ...post({ code }) })
}

export function confirmAuthenticatorReset(token, setupToken, code) {
  return apiFetch('/auth/mfa/reenrol/confirm', { token, ...post({ setup_token: setupToken, code }) })
}

// New codes replace all old ones and are shown once; the server keeps only their hashes.
export function makeBackupCodes(token, code) {
  return apiFetch('/auth/backup-codes', { token, ...post({ code }) })
}

// ------------------------------------------------------------------------ overview

export function getOverview(token) {
  return apiFetch('/admin/overview', { token })
}

// ----------------------------------------------------------------------- referrals

// "mine" = cases the signed-in person has claimed or answered.
export function listReferrals(token, { status, county, mine } = {}) {
  const query = new URLSearchParams(Object.entries({ status, county, mine: mine ? 'true' : '' }).filter(([, v]) => v))
  return apiFetch(`/admin/referrals?${query}`, { token })
}

export function getReferral(token, id) {
  return apiFetch(`/admin/referrals/${id}`, { token })
}

// Claiming stops two officers answering the same case.
export function claimReferral(token, id) {
  return apiFetch(`/admin/referrals/${id}/claim`, { token, method: 'POST' })
}

export function releaseReferral(token, id) {
  return apiFetch(`/admin/referrals/${id}/release`, { token, method: 'POST' })
}

// The officer's own judgement is recorded first; only then does the backend send the
// model's guess, and the judgement cannot change afterwards (keeps judgements independent).
export function recordJudgement(token, id, judgement) {
  return apiFetch(`/admin/referrals/${id}/judgement`, { token, ...post({ judgement }) })
}

export function replyToReferral(token, id, { text, judgement, adviceIds }) {
  return apiFetch(`/admin/referrals/${id}/reply`, { token, ...post({ text, judgement, advice_ids: adviceIds }) })
}

// The farmer's photo as a local object URL (it needs the sign-in token, so a plain <img src> can't load it).
export async function referralPhoto(token, id) {
  const response = await fetch(`${API_URL}/admin/referrals/${id}/photo`, { headers: { Authorization: `Bearer ${token}` } })
  if (!response.ok) throw new ApiError(response.status, 'The photo is no longer stored')
  return URL.createObjectURL(await response.blob())
}

// ------------------------------------------------------------------------ contacts

export function listContacts(token) {
  return apiFetch('/admin/contacts', { token })
}

// Saving a contact counts as checking it: whoever saves it has just looked at the details.
export function saveContact(token, contact) {
  const path = contact.id ? `/admin/contacts/${contact.id}` : '/admin/contacts'
  return apiFetch(path, { method: contact.id ? 'PUT' : 'POST', token, body: JSON.stringify(contact) })
}

export function markContactChecked(token, id) {
  return apiFetch(`/admin/contacts/${id}/checked`, { token, method: 'POST' })
}

export function setContactActive(token, id, active) {
  return apiFetch(`/admin/contacts/${id}/active`, { token, ...post({ active }) })
}

// --------------------------------------------------------------------------- users

export function listUsers(token) {
  return apiFetch('/admin/users', { token })
}

export function setUserActive(token, id, active) {
  return apiFetch(`/admin/users/${id}/active`, { token, ...post({ active }) })
}

// There is no email service yet: these return a one-time link ({ link, expires_in_hours })
// that the admin passes on to the staff member, who chooses a password with it.

// The old password stops working; the staff member chooses a new one from the link.
export function resetPassword(token, id) {
  return apiFetch(`/admin/users/${id}/reset-password`, { token, method: 'POST' })
}

// For a lost phone: the authenticator AND the password are reset (otherwise anyone who knew
// the password could set up their own authenticator); a new one is set up at the next sign-in.
export function resetAuthenticator(token, id) {
  return apiFetch(`/admin/users/${id}/reset-mfa`, { token, method: 'POST' })
}

export function setOfficerCounty(token, id, county) {
  return apiFetch(`/admin/users/${id}/county`, { token, ...post({ county }) })
}

// Officers never sign themselves up: the admin creates the account and passes on the
// returned one-time link; the officer chooses a password and sets up the authenticator app.
export function createOfficer(token, { name, email, county }) {
  return apiFetch('/admin/users/officers', { token, ...post({ name, email, county }) })
}

// --------------------------------------------------------------------------- audit

export function listAudit(token) {
  return apiFetch('/admin/audit', { token })
}

// -------------------------------------------------------------------------- advice

export function listAdvice(token) {
  return apiFetch('/admin/advice', { token })
}

// A correction creates a new version; the old wording stays in the history, and a reply
// keeps the version the farmer was shown.
export function saveAdvice(token, entry, note) {
  const path = entry.id ? `/admin/advice/${entry.id}` : '/admin/advice'
  return apiFetch(path, { method: entry.id ? 'PUT' : 'POST', token, body: JSON.stringify({ ...entry, note }) })
}

export function retireAdvice(token, id, note) {
  return apiFetch(`/admin/advice/${id}/retire`, { token, ...post({ note }) })
}

// --------------------------------------------------------------------------- model

export function getModelSettings(token) {
  return apiFetch('/admin/model', { token })
}
