// Offline reading (g07, level 2): the last copy of Your checks, each opened result, the disease
// library and the support contacts is saved on the phone. With no signal, that copy is shown,
// marked savedCopy, and the screen says it may be out of date. Cleared when the farmer signs
// out, so the next person on the phone never sees it.
import AsyncStorage from '@react-native-async-storage/async-storage';

const PREFIX = 'sproutly.saved.';

/** True for a request that never reached the server (no signal), as opposed to a refusal. */
export function isOffline(error) {
    return Boolean(error?.offline);
}

/**
 * Load fresh data and keep a copy; with no signal, return the saved copy instead.
 * The saved copy is the same data with a hidden `savedCopy` flag (arrays and objects alike).
 */
export async function withSavedCopy(key, load) {
    try {
        const data = await load();
        try {
            await AsyncStorage.setItem(PREFIX + key, JSON.stringify(data));
        } catch {
            // Phone storage full or unavailable: the screen still works, just not offline.
        }
        return data;
    } catch (error) {
        if (!isOffline(error)) throw error;
        let saved = null;
        try {
            saved = JSON.parse(await AsyncStorage.getItem(PREFIX + key));
        } catch {
            saved = null;
        }
        if (saved == null) throw error;
        Object.defineProperty(saved, 'savedCopy', { value: true, enumerable: false });
        return saved;
    }
}

/** Remove every saved copy (on sign-out). */
export async function clearSavedCopies() {
    try {
        const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith(PREFIX));
        if (keys.length) await AsyncStorage.multiRemove(keys);
    } catch {
        // Nothing to clear.
    }
}
