// Offline photo queue (g07, level 1): with no signal, a check is saved on the phone and sent by
// itself once there is a connection. Each queued photo has its own ID (a UUID): if a send reaches
// the server but the reply is lost, sending it again returns the same check, never a second one.
// The photo is made smaller first and kept in the app's own folder, which the phone does not
// clean up. Cleared when the farmer signs out (nothing passes to the next person on the phone).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { shrinkPhoto } from './shrinkPhoto';
import { isOffline } from './savedCopies';

const KEY = 'sproutly.queue.v1';
export const MAX_QUEUED = 10;

const listeners = new Set();
let sending = false;

function folder() {
    const dir = new Directory(Paths.document, 'queue');
    if (!dir.exists) dir.create({ idempotent: true, intermediates: true });
    return dir;
}

export async function loadQueue() {
    try {
        return JSON.parse(await AsyncStorage.getItem(KEY)) || [];
    } catch {
        return [];
    }
}

async function saveQueue(items) {
    await AsyncStorage.setItem(KEY, JSON.stringify(items));
    listeners.forEach((listener) => listener(items));
}

/** Call listener(items) whenever the queue changes; returns an unsubscribe function. */
export function watchQueue(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/**
 * Save photos to send later. photos: [{ uri, crop }] where crop is maize, tomato, potato or null
 * (the server then detects it). Returns how many were saved (the queue holds MAX_QUEUED).
 */
export async function addToQueue({ photos, symptoms, sharing }) {
    const items = await loadQueue();
    const room = Math.max(0, MAX_QUEUED - items.length);
    const added = [];
    for (const photo of photos.slice(0, room)) {
        const id = Crypto.randomUUID();
        const small = new File(await shrinkPhoto(photo.uri));
        const kept = new File(folder(), `${id}.jpg`);
        await small.copy(kept);
        added.push({
            id,
            uri: kept.uri,
            crop: photo.crop || null,
            // A description belongs to one photo: it is kept only for a single queued photo.
            symptoms: photos.length === 1 ? symptoms || null : null,
            sharing: sharing || null,
            savedAt: new Date().toISOString(),
            error: null,
        });
    }
    await saveQueue([...items, ...added]);
    return added.length;
}

function deleteFile(uri) {
    try {
        const file = new File(uri);
        if (file.exists) file.delete();
    } catch {
        // Already gone.
    }
}

export async function removeFromQueue(id) {
    const items = await loadQueue();
    const item = items.find((i) => i.id === id);
    if (item) deleteFile(item.uri);
    await saveQueue(items.filter((i) => i.id !== id));
}

/**
 * Send every waiting photo, one at a time. send(item) does the upload (the screens pass the
 * DiagnosisService call). Stops at the first "no signal" and tries again next time. A photo the
 * server refuses (too blurred, not a leaf) stays in the list with the reason, for the farmer to
 * remove. Returns { sent, failed }.
 */
export async function sendQueue(send) {
    if (sending) return { sent: 0, failed: 0 };
    sending = true;
    let sent = 0;
    let failed = 0;
    try {
        for (const item of await loadQueue()) {
            if (item.error) continue;
            try {
                await send(item);
                await removeFromQueue(item.id);
                sent += 1;
            } catch (error) {
                if (isOffline(error)) break; // still no signal: try later
                const items = await loadQueue();
                await saveQueue(items.map((i) => (i.id === item.id ? { ...i, error: error.message } : i)));
                failed += 1;
            }
        }
    } finally {
        sending = false;
    }
    return { sent, failed };
}

/** How many photos are waiting (for the sign-out warning). */
export async function queuedCount() {
    return (await loadQueue()).length;
}

/** Remove every queued photo and its file (on sign-out). */
export async function clearQueue() {
    const items = await loadQueue();
    items.forEach((item) => deleteFile(item.uri));
    try {
        await AsyncStorage.removeItem(KEY);
    } catch {
        // Nothing to clear.
    }
    listeners.forEach((listener) => listener([]));
    return items.length;
}
