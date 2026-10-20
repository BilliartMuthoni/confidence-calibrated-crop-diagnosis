// Talks to the FastAPI backend's /auth endpoints.
import axios from 'axios';
import { API_BASE_URL } from '../constants/api';
import { watchForExpiredSession } from './session';

const client = axios.create({
    baseURL: API_BASE_URL,
    timeout: 10000,
});
watchForExpiredSession(client);

function extractErrorMessage(error) {
    const detail = error?.response?.data?.detail;
    if (Array.isArray(detail)) {
        // FastAPI/Pydantic validation errors come back as a list of {msg, ...}
        return detail.map((d) => d.msg).join(', ');
    }
    if (typeof detail === 'string') return detail;
    return error?.message || 'Something went wrong. Please try again.';
}

export async function register({ phoneNumber, email, password }) {
    try {
        const payload = { password };
        if (phoneNumber) payload.phone_number = phoneNumber;
        if (email) payload.email = email;
        const { data } = await client.post('/auth/register', payload);
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

export async function login({ phoneNumber, email, password }) {
    try {
        const payload = { password };
        if (phoneNumber) payload.phone_number = phoneNumber;
        if (email) payload.email = email;
        const { data } = await client.post('/auth/login', payload);
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

export async function fetchCurrentUser({ token }) {
    try {
        const { data } = await client.get('/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
        });
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

/** The farmer's county: routes their referrals to that county's officers and picks their contacts. */
export async function setMyCounty({ token, county }) {
    try {
        const { data } = await client.post('/auth/me/county', { county }, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

// register and login both answer with an MFA challenge: next_step is "setup"
// (add Sproutly to an authenticator app first) or "verify" (just enter the code).

/** First code from the authenticator app; turns MFA on and logs the user in. */
export async function confirmMfaSetup({ mfaToken, code }) {
    try {
        const { data } = await client.post('/auth/mfa/setup/confirm', { mfa_token: mfaToken, code });
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

/** Sign-in options the backend has switched on, e.g. ["google"]. */
export async function fetchSignInProviders() {
    try {
        const { data } = await client.get('/auth/oauth/providers');
        return data.providers;
    } catch {
        // No buttons is better than a broken screen; password login still works.
        return [];
    }
}

/** Swap the one-time code from a Google sign-in for tokens (or an authenticator challenge). */
export async function exchangeOAuthCode({ code, codeVerifier }) {
    try {
        const { data } = await client.post('/auth/oauth/exchange', { code, code_verifier: codeVerifier });
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

/** Code from the authenticator app after the password; returns the session tokens. */
export async function verifyMfa({ mfaToken, code }) {
    try {
        const { data } = await client.post('/auth/mfa/verify', { mfa_token: mfaToken, code });
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}
