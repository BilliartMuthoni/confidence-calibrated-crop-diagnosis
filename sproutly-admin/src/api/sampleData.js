// Sample data for building and demonstrating the portal before the admin API exists.
// Every person here is fictional: names say "Sample", emails use example.org (reserved
// for examples), and phone numbers are placeholders. Advice entries are real excerpts
// from the saved Plantwise and PlantVillage management sections, with their sources.

const hoursAgo = (hours) => new Date(Date.now() - hours * 3600000).toISOString()
const hoursAhead = (hours) => new Date(Date.now() + hours * 3600000).toISOString()

export const SAMPLE_ACCOUNTS = {
  'admin@example.org': { id: 1, name: 'Sample Admin', role: 'admin', county: null, needsSetup: false },
  'officer.nakuru@example.org': { id: 2, name: 'Sample Officer (Nakuru)', role: 'officer', county: 'Nakuru', needsSetup: false },
  'new.officer@example.org': { id: 7, name: 'Sample New Officer (Meru)', role: 'officer', county: 'Meru', needsSetup: true },
}
export const SAMPLE_PASSWORD = 'sample-password'

export function sampleStore() {
  return {
    referrals: [
      {
        id: 301, created_at: hoursAgo(5), expires_at: hoursAhead(163), county: 'Nakuru', crop: 'potato',
        farmer: 'Farmer 1042', consent: true, status: 'waiting',
        guess: { disease: 'Potato___Late_blight', confidence: 0.58 }, crop_mismatch: false,
        symptoms_text: 'Black patches on the leaves after the rains, spreading fast.', reply: null,
      },
      {
        id: 302, created_at: hoursAgo(20), expires_at: hoursAhead(148), county: 'Nakuru', crop: 'tomato',
        farmer: 'Farmer 0877', consent: true, status: 'waiting',
        guess: { disease: 'Tomato___Early_blight', confidence: 0.47 }, crop_mismatch: false,
        symptoms_text: null, reply: null,
      },
      {
        id: 303, created_at: hoursAgo(30), expires_at: hoursAhead(138), county: 'Meru', crop: 'maize',
        farmer: 'Farmer 1311', consent: true, status: 'waiting',
        guess: { disease: 'Corn_(maize)___Common_rust_', confidence: 0.41 }, crop_mismatch: true,
        symptoms_text: null, reply: null,
      },
      {
        id: 304, created_at: hoursAgo(52), expires_at: hoursAhead(116), county: 'Kiambu', crop: 'tomato',
        farmer: 'Farmer 0590', consent: true, status: 'waiting',
        guess: { disease: 'Tomato___Bacterial_spot', confidence: 0.63 }, crop_mismatch: false,
        symptoms_text: 'Small dark spots with yellow edges on lower leaves.', reply: null,
      },
      {
        id: 295, created_at: hoursAgo(75), expires_at: hoursAhead(93), county: 'Nakuru', crop: 'maize',
        farmer: 'Farmer 0412', consent: true, status: 'answered',
        guess: { disease: 'Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot', confidence: 0.55 }, crop_mismatch: false,
        symptoms_text: null,
        reply: {
          text: 'From the photo this looks like gray leaf spot on the lower leaves. Remove the worst leaves, and visit the ward office this week so we can confirm before you buy any fungicide.',
          correct_disease: 'Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot', officer: 'Sample Officer (Nakuru)',
          replied_at: hoursAgo(60),
        },
      },
      {
        id: 288, created_at: hoursAgo(200), expires_at: hoursAgo(32), county: 'Nyandarua', crop: 'potato',
        farmer: 'Farmer 0233', consent: true, status: 'expired',
        guess: { disease: 'Potato___Early_blight', confidence: 0.39 }, crop_mismatch: false,
        symptoms_text: null, reply: null,
      },
    ],
    contacts: [
      { id: 11, county: 'Nakuru', name: 'Sample Officer A', role: 'Ward Agricultural Extension Officer', organisation: 'County Department of Agriculture', phone: '0700 000 001', email: 'officer.a@example.org', active: true },
      { id: 12, county: 'Nakuru', name: 'Sample Plant Clinic', role: 'Plant clinic (market day)', organisation: 'County Department of Agriculture', phone: '0700 000 002', email: null, active: true },
      { id: 13, county: 'Meru', name: 'Sample Officer B', role: 'Sub-county Crops Officer', organisation: 'County Department of Agriculture', phone: '0700 000 003', email: 'officer.b@example.org', active: true },
      { id: 14, county: 'Kiambu', name: 'Sample Officer C', role: 'Ward Agricultural Extension Officer', organisation: 'County Department of Agriculture', phone: '0700 000 004', email: null, active: true },
      { id: 15, county: 'Nyandarua', name: 'Sample Officer D', role: 'Ward Agricultural Extension Officer', organisation: 'County Department of Agriculture', phone: '0700 000 005', email: null, active: false },
    ],
    users: [
      { id: 1, name: 'Sample Admin', contact: 'admin@example.org', role: 'admin', county: null, mfa: true, active: true, created_at: hoursAgo(900) },
      { id: 2, name: 'Sample Officer (Nakuru)', contact: 'officer.nakuru@example.org', role: 'officer', county: 'Nakuru', mfa: true, active: true, created_at: hoursAgo(400) },
      { id: 7, name: 'Sample New Officer (Meru)', contact: 'new.officer@example.org', role: 'officer', county: 'Meru', mfa: false, active: true, created_at: hoursAgo(3) },
      { id: 21, name: 'Farmer 1042', contact: '07xx xxx 042', role: 'farmer', county: 'Nakuru', mfa: true, active: true, created_at: hoursAgo(300) },
      { id: 22, name: 'Farmer 0877', contact: '07xx xxx 877', role: 'farmer', county: 'Nakuru', mfa: true, active: true, created_at: hoursAgo(250) },
      { id: 23, name: 'Farmer 1311', contact: '07xx xxx 311', role: 'farmer', county: 'Meru', mfa: true, active: true, created_at: hoursAgo(120) },
      { id: 24, name: 'Farmer 0233', contact: '07xx xxx 233', role: 'farmer', county: 'Nyandarua', mfa: true, active: false, created_at: hoursAgo(700) },
    ],
    advice: [
      {
        id: 501, disease: 'Tomato___Early_blight', kind: 'prevention', version: 1, status: 'active',
        text: 'Use non-infected seeds from healthy tomatoes, or certified seeds.',
        source_title: 'Early blight management in tomatoes (Plantwise factsheet, Tanzania, October 2012)',
        source_url: 'https://factsheetadmin.plantwise.org/Uploads/PDFs/20137803397.pdf', licence: 'CC BY-SA 4.0',
        history: [{ version: 1, at: hoursAgo(48), by: 'Sample Admin', note: 'Imported from the reviewed advice file' }],
      },
      {
        id: 502, disease: 'Tomato___Early_blight', kind: 'prevention', version: 1, status: 'active',
        text: 'Remove and destroy plant residues and debris.',
        source_title: 'Early blight management in tomatoes (Plantwise factsheet, Tanzania, October 2012)',
        source_url: 'https://factsheetadmin.plantwise.org/Uploads/PDFs/20137803397.pdf', licence: 'CC BY-SA 4.0',
        history: [{ version: 1, at: hoursAgo(48), by: 'Sample Admin', note: 'Imported from the reviewed advice file' }],
      },
      {
        id: 503, disease: 'Tomato___Early_blight', kind: 'treatment', version: 1, status: 'active',
        text: 'Apply appropriate fungicide at first sign of disease; destroy any volunteer solanaceous plants (tomato, potato, nightshade etc); practice crop rotation',
        source_title: 'PlantVillage: Tomato - Early blight', source_url: 'https://plantvillage.psu.edu/topics/tomato/infos',
        licence: 'CC BY-SA 3.0',
        history: [{ version: 1, at: hoursAgo(48), by: 'Sample Admin', note: 'Imported from the reviewed advice file' }],
      },
      {
        id: 504, disease: 'Corn_(maize)___Northern_Leaf_Blight', kind: 'prevention', version: 1, status: 'active',
        text: 'Follow crop rotation with non host crop.',
        source_title: 'PlantVillage: Corn (maize) - Northern Leaf Blight', source_url: 'https://plantvillage.psu.edu/topics/corn-maize/infos',
        licence: 'CC BY-SA 3.0',
        history: [{ version: 1, at: hoursAgo(48), by: 'Sample Admin', note: 'Imported from the reviewed advice file' }],
      },
      {
        id: 505, disease: 'Corn_(maize)___Northern_Leaf_Blight', kind: 'prevention', version: 1, status: 'active',
        text: 'Grow available resistant varieties.',
        source_title: 'PlantVillage: Corn (maize) - Northern Leaf Blight', source_url: 'https://plantvillage.psu.edu/topics/corn-maize/infos',
        licence: 'CC BY-SA 3.0',
        history: [{ version: 1, at: hoursAgo(48), by: 'Sample Admin', note: 'Imported from the reviewed advice file' }],
      },
    ],
    overview: {
      checks_this_week: 184,
      referred_this_week: 39,
      answered_within_7_days: 0.82,
      top_results: [
        ['Tomato___Late_blight', 31], ['Potato___Late_blight', 27], ['Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot', 22],
        ['Tomato___healthy', 19], ['Corn_(maize)___Common_rust_', 14], ['Tomato___Early_blight', 12],
      ],
      by_county: [['Nakuru', 61], ['Meru', 38], ['Kiambu', 33], ['Nyandarua', 29], ['Kisii', 23]],
      // FR x: how sure the model was on the cases it referred (bins of 0.1 up to the threshold).
      referred_confidence: [[0.2, 2], [0.3, 5], [0.4, 9], [0.5, 12], [0.6, 7], [0.7, 3], [0.8, 1]],
    },
    model: {
      image_model: 'ResNet-50 (architecture comparison, notebook 10)',
      text_model: 'BERT-base, late fusion (notebook 11b)',
      calibration: 'Not applied yet: chosen by notebook 13 on the selection set',
      threshold: 0.9,
      threshold_note: 'Provisional value; notebook 13 sets the calibrated threshold (never below 0.5)',
      fitted_on: 'Selection set: 3,821 unseen field photos (notebook 12)',
    },
  }
}
