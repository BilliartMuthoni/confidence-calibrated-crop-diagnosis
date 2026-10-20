// The sign-in keys: where they are kept and how they are renewed (#38).
//
// The access token lasts 15 minutes; the refresh token lasts 7 days and works once: the
// backend swaps it for a new pair (/auth/refresh). So a farmer who opens the app at least
// once a week stays signed in, and a copied refresh token is noticed when it is reused.
// Both are kept in the phone's secure storage (Android Keystore / iOS Keychain), not in
// plain app storage.
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { API_BASE_URL } from '../constants/api';

const ACCESS = 'sproutly.accessToken';
const REFRESH = 'sproutly.refreshToken';
// Where versions before this one kept the keys, in plain storage.
const OLD_KEYS = ['userToken', 'refreshToken'];

export async function saveTokens(access, refresh) {
    await SecureStore.setItemAsync(ACCESS, access);
    if (refresh) await SecureStore.setItemAsync(REFRESH, refresh);
    else await SecureStore.deleteItemAsync(REFRESH);
}

export async function readTokens() {
    const access = await SecureStore.getItemAsync(ACCESS);
    if (access) return { access, refresh: await SecureStore.getItemAsync(REFRESH) };
    // Keys saved by an older version: move them to secure storage once.
    const [[, oldAccess], [, oldRefresh]] = await AsyncStorage.multiGet(OLD_KEYS);
    await AsyncStorage.multiRemove(OLD_KEYS);
    if (!oldAccess) return { access: null, refresh: null };
    await saveTokens(oldAccess, oldRefresh);
    return { access: oldAccess, refresh: oldRefresh };
}

export async function clearTokens() {
    await SecureStore.deleteItemAsync(ACCESS);
    await SecureStore.deleteItemAsync(REFRESH);
    await AsyncStorage.multiRemove(OLD_KEYS);
}

/** True if the token expires within `seconds` (or can't be read). Only the expiry is read;
 *  the backend checks the signature. */
export function expiresWithin(token, seconds) {
    try {
        const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const { exp } = JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)));
        return exp * 1000 - Date.now() < seconds * 1000;
    } catch {
        return true;
    }
}

let renewed = null;
/** AuthContext passes a function that receives each new access token. */
export function onTokensRenewed(handler) {
    renewed = handler;
}

let inFlight = null;
/**
 * Swap the refresh token for a new pair. Resolves to the new access token, or null when the
 * session has really ended (no refresh token, or the backend refused it). Throws on network
 * trouble, so a farmer without signal is not logged out. Several requests that fail at the
 * same moment share one renewal: a refresh token works only once.
 */
export function renewSession() {
    if (!inFlight) {
        inFlight = (async () => {
            const { refresh } = await readTokens();
            if (!refresh) return null;
            try {
                const { data } = await axios.post(`${API_BASE_URL}/auth/refresh`, { refresh_token: refresh },
                    { timeout: 10000 });
                await saveTokens(data.access_token, data.refresh_token);
                renewed?.(data.access_token);
                return data.access_token;
            } catch (error) {
                if (error?.response?.status === 401) return null;
                throw error;
            }
        })().finally(() => {
            inFlight = null;
        });
    }
    return inFlight;
}

/** Tell the backend to end this session; best effort, never blocks logging out. */
export async function endSessionOnServer() {
    try {
        const { refresh } = await readTokens();
        if (refresh) await axios.post(`${API_BASE_URL}/auth/logout`, { refresh_token: refresh }, { timeout: 5000 });
    } catch {
        // Offline or the server is down: the keys are still deleted from the phone.
    }
}
