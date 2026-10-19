// Talks to the backend's /contacts endpoint: the county support contacts an admin keeps up to date.
import axios from 'axios';
import { API_BASE_URL } from '../constants/api';
import { watchForExpiredSession } from './session';

const client = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });
watchForExpiredSession(client);

/** Contacts shown for a county (default: the county the backend has for this farmer). */
export async function fetchContacts({ token, county }) {
    try {
        const { data } = await client.get('/contacts', {
            params: county ? { county } : undefined,
            headers: { Authorization: `Bearer ${token}` },
        });
        return data;
    } catch (error) {
        const detail = error?.response?.data?.detail;
        throw new Error(typeof detail === 'string' ? detail : error?.message || 'Could not load the contacts.');
    }
}
