// Talks to the FastAPI backend's /diagnose endpoints.
import axios from 'axios';
import { API_BASE_URL } from '../constants/api';
import { watchForExpiredSession } from './session';
import { shrinkPhoto } from '../utils/shrinkPhoto';

const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000, // uploads over rural connections need room
});
watchForExpiredSession(client);

function extractErrorMessage(error) {
    const detail = error?.response?.data?.detail;
    if (Array.isArray(detail)) {
        return detail.map((d) => d.msg).join(', ');
    }
    if (typeof detail === 'string') return detail;
    if (error?.code === 'ECONNABORTED') {
        return 'The upload timed out. Check your connection and try again.';
    }
    return error?.message || 'Something went wrong. Please try again.';
}

/** The farmer's choices for a case Sproutly can't diagnose: share it with a county officer,
 *  and (separately) let the officer phone them. The county routes it to that county's officers. */
function appendSharing(formData, sharing) {
    if (!sharing?.share) return;
    formData.append('share_with_officer', 'true');
    if (sharing.contact) formData.append('allow_contact', 'true');
    if (sharing.county) formData.append('county', sharing.county);
}

export async function submitDiagnosis({ token, crop, imageUri, symptoms, sharing }) {
    try {
        const formData = new FormData();
        formData.append('crop', crop);
        if (symptoms?.trim()) formData.append('symptoms_text', symptoms.trim());
        appendSharing(formData, sharing);
        formData.append('image', {
            uri: await shrinkPhoto(imageUri),
            name: 'leaf.jpg',
            type: 'image/jpeg',
        });

        const { data } = await client.post('/diagnose', formData, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'multipart/form-data',
            },
        });
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

/**
 * Several photos at once. crop is 'maize' | 'tomato' | 'potato' for all photos, or null to
 * let the backend detect each photo's crop. Resolves to { results: [{ index, result, error }] }.
 */
export async function submitBatch({ token, crop, imageUris, sharing }) {
    try {
        const formData = new FormData();
        if (crop) formData.append('crop', crop);
        appendSharing(formData, sharing);
        // One at a time: shrinking ten full-size photos at once can run a cheap phone out of memory.
        for (const [i, uri] of imageUris.entries()) {
            formData.append('images', { uri: await shrinkPhoto(uri), name: `leaf-${i + 1}.jpg`, type: 'image/jpeg' });
        }

        const { data } = await client.post('/diagnose/batch', formData, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'multipart/form-data',
            },
            // Up to 10 photos in one upload: give slow connections more time than one photo.
            timeout: 120000,
        });
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

/** The farmer corrects a detected crop: the same photo is checked again with their crop. */
export async function correctCrop({ token, diagnosisId, crop }) {
    try {
        const { data } = await client.post(
            `/diagnose/${diagnosisId}/crop`,
            { crop },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

/** A question about one diagnosis (D9). The reply is library advice, a fixed question with
 *  reply buttons, a hand-over to the officer, or "not about this"; never written by the model. */
export async function askAssistant({ token, diagnosisId, question, history }) {
    try {
        const { data } = await client.post(
            `/diagnose/${diagnosisId}/ask`,
            { question, history },
            { headers: { Authorization: `Bearer ${token}` } }
        );
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

/** Which model the server runs (no sign-in needed); null if the server cannot be reached. */
export async function fetchServerVersion() {
    try {
        const { data } = await client.get('/health', { timeout: 10000 });
        return data;
    } catch {
        return null;
    }
}

export async function fetchHistory({ token }) {
    try {
        const { data } = await client.get('/diagnose/history', {
            headers: { Authorization: `Bearer ${token}` },
        });
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

/** One past check with everything about it: the result and advice, what the farmer described,
 *  the referral and the officer's reply. */
export async function fetchDiagnosis({ token, diagnosisId }) {
    try {
        const { data } = await client.get(`/diagnose/${diagnosisId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

/** Image source for a check's photo: it is private, so the request carries the sign-in token. */
/** A check's photo, as a data URI the Image can show. It is private, so it goes through the same
 *  client as every other request: an expired sign-in is renewed and the request sent again.
 *  (Handing the Image a URL with the token left a blank space when the token had run out.) */
export async function fetchDiagnosisPhoto({ token, diagnosisId }) {
    try {
        const { data } = await client.get(`/diagnose/${diagnosisId}/photo`, {
            headers: { Authorization: `Bearer ${token}` },
            responseType: 'blob',
        });
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('The photo could not be read.'));
            reader.readAsDataURL(data);
        });
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}
