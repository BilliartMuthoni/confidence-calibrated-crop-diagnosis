import AsyncStorage from '@react-native-async-storage/async-storage';

// A farmer who has just set up the authenticator has no backup codes yet; if the phone is then
// lost they cannot sign in. Home offers to make them (once per app start) until they exist.
// Found in testing: backup codes were only reachable from Account.
const KEY = 'sproutly.needsBackupCodes';

export async function markNeedsBackupCodes() {
    try {
        await AsyncStorage.setItem(KEY, '1');
    } catch {
        // Storage refused: the farmer can still make codes from Account.
    }
}

export async function needsBackupCodes() {
    try {
        return (await AsyncStorage.getItem(KEY)) === '1';
    } catch {
        return false;
    }
}

export async function clearBackupCodesReminder() {
    try {
        await AsyncStorage.removeItem(KEY);
    } catch {
        // Nothing to do: at worst Home asks once more.
    }
}
