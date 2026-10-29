// Colours for the farmer screens. Same palette as before, named by meaning so every
// screen uses them the same way: brand green for actions, warm orange for a disease,
// blue for a referral, green for a healthy leaf, and red only for actions that can't be
// undone (log out, delete): orange means a disease, not "careful".
export const COLORS = {
    background: '#F5F7F4',
    surface: '#FFFFFF',
    ink: '#0B1A13', // headings
    text: '#1F2A24', // body text
    muted: '#5F6B65', // secondary text
    faint: '#8A9690', // hints, timestamps
    divider: '#E2E7E3',
    brand: '#1B4332',
    brandLight: '#2D5A43',
    disease: '#B4622A',
    referral: '#3A6EA5',
    healthy: '#2F7D4F',
    danger: '#B3261E', // 6.5:1 with white text
};

export const CROP_LABELS = { maize: 'Maize', tomato: 'Tomato', potato: 'Potato' };
