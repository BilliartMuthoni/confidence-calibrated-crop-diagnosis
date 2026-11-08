import * as ImagePicker from 'expo-image-picker';
import { showDialog } from '../components/Dialog';

/** The camera, or null (with a message) if the farmer has not allowed it. */
async function fromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
        showDialog(
            'Camera access needed',
            'Sproutly needs your camera to photograph the affected leaf. You can enable it in your phone settings.'
        );
        return null;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
    return result.canceled ? null : result.assets[0];
}

/** One photo from the gallery, or null. */
async function fromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
        showDialog(
            'Photo access needed',
            'Sproutly needs access to your photos to use an existing picture. You can enable it in your phone settings.'
        );
        return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    return result.canceled ? null : result.assets[0];
}

/**
 * Retake (n21): "Take photo" or "Choose from gallery" for ONE replacement photo.
 * Resolves to the new photo asset, or null if the farmer cancels.
 */
export function chooseOnePhoto(title = 'Retake the photo') {
    return new Promise((resolve) => {
        showDialog(title, 'Hold the phone still, tap the leaf to focus, and use good light.', [
            { text: 'Take photo', onPress: () => fromCamera().then(resolve) },
            { text: 'Choose from gallery', onPress: () => fromGallery().then(resolve) },
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
        ]);
    });
}
