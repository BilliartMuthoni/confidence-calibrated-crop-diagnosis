// Disease names come from the backend as "Potato Early Blight" (also stored that way and used in
// the portal). The app shows them in sentence case like the rest of its text: "Potato early blight".

/** "Potato Early Blight" -> "Potato early blight". */
export function diseaseLabel(name) {
    if (!name) return '';
    return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

/** Without the crop, for lists already grouped or labelled by crop: "Tomato Late Blight" -> "Late blight". */
export function shortDiseaseLabel(name) {
    return diseaseLabel((name || '').replace(/^(maize|tomato|potato)\s+/i, ''));
}
