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
        // Only called once the farmer has ticked "I agree to the Terms of use and Privacy policy".
        const payload = { password, accept_terms: true };
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

// register and login both answer with a challenge: next_step is "verify_email" (enter the code
// emailed to the farmer first), "setup" (add Sproutly to an authenticator app) or "verify"
// (just enter the authenticator code).

/** The screen (and its params) for a challenge from register, login or email verify. */
export function challengeScreen(data) {
    // An email or SMS code (t08, t22) uses the same code screen.
    const name = { verify_email: 'EmailCode', verify_phone: 'EmailCode', setup: 'MfaSetup' }[data.next_step] || 'MfaCode';
    return [name, {
        mfaToken: data.mfa_token,
        expiresInMinutes: data.expires_in_minutes,
        setup: data.setup,
        email: data.email,
        phone: data.phone,
        byPhone: data.next_step === 'verify_phone',
        resendInSeconds: data.resend_in_seconds,
    }];
}

/** The 6-digit code from the SMS (t22); answers the next challenge (authenticator). */
export async function verifyPhoneCode({ mfaToken, code }) {
    try {
        const { data } = await client.post('/auth/phone/verify', { mfa_token: mfaToken, code });
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

/** Send a new SMS code (one a minute, ten a day). */
export async function resendPhoneCode({ mfaToken }) {
    try {
        const { data } = await client.post('/auth/phone/resend', { mfa_token: mfaToken });
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

/** The 6-digit code from the confirmation email; answers the next challenge (authenticator). */
export async function verifyEmailCode({ mfaToken, code }) {
    try {
        const { data } = await client.post('/auth/email/verify', { mfa_token: mfaToken, code });
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

/** Send a new confirmation code (one a minute, ten a day). */
export async function resendEmailCode({ mfaToken }) {
    try {
        const { data } = await client.post('/auth/email/resend', { mfa_token: mfaToken });
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

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

/**
 * Join Google to the password account with the same email: its password, plus the
 * authenticator code if it has one. Answers { tokens } or { challenge } (setup still to do).
 */
export async function linkGoogle({ linkToken, password, code }) {
    try {
        const payload = { link_token: linkToken, password };
        if (code) payload.code = code;
        const { data } = await client.post('/auth/oauth/link', payload);
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

/** A Google account adds a Sproutly password, straight after a Google sign-in. Answers the setup challenge. */
export async function addPassword({ token, password, email }) {
    try {
        const { data } = await client.post('/auth/password/add', { password, email }, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

// --- Account tab ---

async function authorizedPost(path, token, body) {
    try {
        const { data } = await client.post(path, body, { headers: { Authorization: `Bearer ${token}` } });
        return data;
    } catch (error) {
        throw new Error(extractErrorMessage(error));
    }
}

/** Change the password. Answers a fresh sign-in for this phone; other phones are signed out. */
export function changePassword({ token, currentPassword, newPassword }) {
    return authorizedPost('/auth/password', token, { current_password: currentPassword, new_password: newPassword });
}

/** Moving the authenticator to a new phone, step 1: a code from the current app. Answers the new key. */
export function startNewAuthenticator({ token, code }) {
    return authorizedPost('/auth/mfa/reenrol/start', token, { code });
}

/** Step 2: a code from the authenticator on the new phone. The old one stops working. */
export function confirmNewAuthenticator({ token, setupToken, code }) {
    return authorizedPost('/auth/mfa/reenrol/confirm', token, { setup_token: setupToken, code });
}

/** Ten new single-use backup codes, shown once; all older codes stop working. */
export function makeBackupCodes({ token, code }) {
    return authorizedPost('/auth/backup-codes', token, { code });
}

/** Delete the account and its data. Password accounts send password and code; an account made
 *  with Google sends neither, right after continuing with Google again. */
export function deleteAccount({ token, password, code }) {
    const body = {};
    if (password) body.password = password;
    if (code) body.code = code;
    return authorizedPost('/auth/me/delete', token, body);
}

/** Change the phone number and email the farmer logs in with (empty removes one). Proof: password
 *  and code, or nothing right after continuing with Google. Answers a fresh sign-in. */
export function changeContact({ token, phoneNumber, email, password, code }) {
    const body = { phone_number: phoneNumber || '', email: email || '' };
    if (password) body.password = password;
    if (code) body.code = code;
    return authorizedPost('/auth/me/contact', token, body);
}

/** Which county a position is in ({ county }, null outside Kenya). The position is not kept. */
export function locateCounty({ token, latitude, longitude }) {
    return authorizedPost('/auth/county/locate', token, { latitude, longitude });
}

/** Keep the questions asked about results (true) or stop keeping new ones (false). Answers the profile. */
export function setKeepQuestions({ token, keep }) {
    return authorizedPost('/auth/me/privacy', token, { keep_questions: keep });
}

/** "I agree" to the current Terms of use and Privacy policy. Answers the profile. */
export function acceptTerms({ token }) {
    return authorizedPost('/auth/me/terms', token, {});
}

/** Delete every kept question on all checks; the checks themselves stay. */
export function deleteSavedQuestions({ token }) {
    return authorizedPost('/auth/me/questions/delete', token, {});
}

/** Connect Google, step 1: password and code first. Answers { authorization_url } (Google's page). */
export function startConnect({ token, provider, password, code, redirectUri, codeChallenge }) {
    return authorizedPost(`/auth/oauth/${provider}/connect`, token,
        { password, code, redirect_uri: redirectUri, code_challenge: codeChallenge });
}

/** Connect Google, step 2: the one-time code Google's page sent back, with the PKCE verifier. */
export function finishConnect({ token, code, codeVerifier }) {
    return authorizedPost('/auth/oauth/connect/finish', token, { code, code_verifier: codeVerifier });
}

/** Stop signing in with Google (accounts with a password only). */
export function disconnect({ token, provider, password, code }) {
    return authorizedPost(`/auth/oauth/${provider}/disconnect`, token, { password, code });
}

/** A backup code instead of the authenticator code (lost phone); each code works once. */
export async function verifyBackupCode({ mfaToken, code }) {
    try {
        const { data } = await client.post('/auth/mfa/backup', { mfa_token: mfaToken, code });
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
