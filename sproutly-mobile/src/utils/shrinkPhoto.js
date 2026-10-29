// Photos are made smaller on the phone before they are sent: the longest side becomes at most
// 1024 px and the JPEG is saved once at quality 0.8. A phone photo (often 4000 px and several MB)
// becomes a few hundred KB, so uploads on rural mobile data are about ten times smaller and
// faster. The models look at 224 px, and 1024 px still gives county officers a clear photo.
// The new file has no EXIF data, so the phone's location (GPS) never leaves it either.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export const MAX_SIDE = 1024;
const QUALITY = 0.8;

export async function shrinkPhoto(uri) {
    try {
        const original = await ImageManipulator.manipulate(uri).renderAsync();
        let image = original;
        if (Math.max(original.width, original.height) > MAX_SIDE) {
            const context = ImageManipulator.manipulate(uri);
            // Only the longer side is given, so the shape of the photo is kept.
            context.resize(original.width >= original.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
            image = await context.renderAsync();
        }
        const saved = await image.saveAsync({ compress: QUALITY, format: SaveFormat.JPEG });
        return saved.uri;
    } catch {
        // Shrinking failed (an unusual file): send the photo as it is; the server shrinks it too.
        return uri;
    }
}
