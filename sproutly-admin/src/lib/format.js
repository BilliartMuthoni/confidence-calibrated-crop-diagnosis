// Small shared helpers: names, dates and numbers shown the same way on every page.

export const COUNTIES = [
  'Baringo', 'Bomet', 'Bungoma', 'Busia', 'Elgeyo-Marakwet', 'Embu', 'Garissa', 'Homa Bay', 'Isiolo',
  'Kajiado', 'Kakamega', 'Kericho', 'Kiambu', 'Kilifi', 'Kirinyaga', 'Kisii', 'Kisumu', 'Kitui', 'Kwale',
  'Laikipia', 'Lamu', 'Machakos', 'Makueni', 'Mandera', 'Marsabit', 'Meru', 'Migori', 'Mombasa', "Murang'a",
  'Nairobi', 'Nakuru', 'Nandi', 'Narok', 'Nyamira', 'Nyandarua', 'Nyeri', 'Samburu', 'Siaya', 'Taita-Taveta',
  'Tana River', 'Tharaka-Nithi', 'Trans Nzoia', 'Turkana', 'Uasin Gishu', 'Vihiga', 'Wajir', 'West Pokot',
]

// The model's 11 classes (PlantVillage folder names) and how people read them.
export const DISEASES = {
  'Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot': 'Maize gray leaf spot',
  'Corn_(maize)___Common_rust_': 'Maize common rust',
  'Corn_(maize)___Northern_Leaf_Blight': 'Maize northern leaf blight',
  'Corn_(maize)___healthy': 'Healthy maize',
  'Tomato___Bacterial_spot': 'Tomato bacterial spot',
  'Tomato___Early_blight': 'Tomato early blight',
  'Tomato___Late_blight': 'Tomato late blight',
  'Tomato___healthy': 'Healthy tomato',
  'Potato___Early_blight': 'Potato early blight',
  'Potato___Late_blight': 'Potato late blight',
  'Potato___healthy': 'Healthy potato',
}

export const CROPS = { maize: 'Maize', tomato: 'Tomato', potato: 'Potato' }
export const CROP_PREFIX = { maize: 'Corn_(maize)___', tomato: 'Tomato___', potato: 'Potato___' }

export function diseaseName(className) {
  return DISEASES[className] ?? className
}

// An officer's judgement is one of the 11 classes or one of these, never free text, so it
// can be compared with the model's guess and kept as a candidate label.
export const JUDGEMENTS = {
  other_disease: 'Another disease (not one Sproutly knows)',
  cannot_tell: "Can't tell from the photo",
  farm_visit: 'Needs a farm visit',
}

export function judgementName(value) {
  return JUDGEMENTS[value] ?? diseaseName(value)
}

export const REFERRAL_STATUS = { new: 'new', in_review: 'in review', answered: 'answered', expired: 'expired' }

// A support contact shown to farmers in every county (the backend's NATIONWIDE).
export const NATIONWIDE = 'Nationwide'

export const CONTACT_KINDS ={ office: 'Extension office', clinic: 'Plant clinic', agrovet: 'Agrovet', hotline: 'Hotline' }

export const AUDIT_ACTIONS = {
  sign_in: 'Signed in',
  sign_in_failed: 'Failed sign-in',
  password_change: 'Changed own password',
  contact_change: 'Changed own phone or email',
  password_set: 'Chose a password from a link',
  mfa_reenrol: 'Set up authenticator again',
  backup_codes: 'Made new backup codes',
  referral_claim: 'Claimed a referral',
  referral_release: 'Released a referral',
  referral_reply: 'Replied to a referral',
  contact_add: 'Added a contact',
  contact_edit: 'Edited a contact',
  contact_checked: 'Checked a contact',
  contact_hide: 'Hid a contact',
  contact_show: 'Showed a contact',
  user_create: 'Created an officer',
  user_deactivate: 'Deactivated an account',
  user_reactivate: 'Reactivated an account',
  user_reset_password: 'Reset a password',
  user_reset_mfa: 'Reset an authenticator',
  user_county: 'Changed an officer\'s county',
  advice_add: 'Added advice',
  advice_correct: 'Corrected advice',
  advice_retire: 'Retired advice',
  account_deleted: 'A farmer deleted their account',
  google_connected: 'Connected Google',
  google_disconnected: 'Disconnected Google',
  photos_deleted: 'Old photos deleted (automatic)',
}

// The API sends UTC times without a zone marker; read them as UTC (same rule as the mobile app).
export function parseUtc(value) {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value}Z`)
}

export function formatDate(value) {
  return parseUtc(value).toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

export function timeAgo(value) {
  const minutes = Math.round((Date.now() - parseUtc(value).getTime()) / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  return days === 1 ? 'yesterday' : `${days} days ago`
}

export function daysSince(value) {
  return Math.floor((Date.now() - parseUtc(value).getTime()) / 86400000)
}

export function daysLeft(value) {
  return Math.ceil((parseUtc(value).getTime() - Date.now()) / 86400000)
}

// Time left before a referral expires, short ("18h left", "3d left"), and whether it is under a
// day: only those are shown in orange, so the colour keeps its meaning.
export function timeLeft(value) {
  const hours = (parseUtc(value).getTime() - Date.now()) / 3600000
  if (hours <= 0) return { text: 'Expired', urgent: false }
  if (hours < 1) return { text: `${Math.max(1, Math.round(hours * 60))}m left`, urgent: true }
  if (hours < 24) return { text: `${Math.floor(hours)}h left`, urgent: true }
  return { text: `${Math.floor(hours / 24)}d left`, urgent: false }
}

export function percent(value, digits = 0) {
  return value == null || Number.isNaN(value) ? '-' : `${(value * 100).toFixed(digits)}%`
}
