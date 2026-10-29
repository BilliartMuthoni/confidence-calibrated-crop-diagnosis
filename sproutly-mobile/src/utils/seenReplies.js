// Which officers' replies the farmer has already opened, remembered on the phone, so Home
// shows only new ones. Opening the check's full result marks its reply as read.
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'seenOfficerReplies';

export async function loadSeenReplies() {
    try {
        return new Set(JSON.parse((await AsyncStorage.getItem(KEY)) || '[]'));
    } catch {
        return new Set();
    }
}

export async function markReplySeen(diagnosisId) {
    try {
        const seen = await loadSeenReplies();
        if (seen.has(diagnosisId)) return;
        seen.add(diagnosisId);
        // The latest 200 are plenty: Your checks lists at most 50.
        await AsyncStorage.setItem(KEY, JSON.stringify([...seen].slice(-200)));
    } catch {
        // Not saved: the notice shows again until the next time it is opened.
    }
}
