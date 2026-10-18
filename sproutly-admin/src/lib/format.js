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

export function diseaseName(className) {
  return DISEASES[className] ?? className
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

export function daysLeft(value) {
  return Math.ceil((parseUtc(value).getTime() - Date.now()) / 86400000)
}

export function percent(value, digits = 0) {
  return value == null || Number.isNaN(value) ? '-' : `${(value * 100).toFixed(digits)}%`
}
