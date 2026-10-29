import React, { useState, useContext, useEffect, useRef } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    ScrollView,
    TextInput,
    Image,
    KeyboardAvoidingView,
    Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { AuthContext } from '../../context/AuthContext';
import { submitDiagnosis, submitBatch } from '../../api/DiagnosisService';
import { toFriendlyError } from '../../utils/errorMessages';
import ErrorBanner from '../../components/ErrorBanner';
import BusyOverlay from '../../components/BusyOverlay';
import ScreenHeader from '../../components/ScreenHeader';
import { PrimaryButton } from '../../components/Buttons';
import CountyPicker from '../../components/CountyPicker';
import { loadCounty, saveCounty } from '../../utils/farmerCounty';
import { COLORS } from '../../constants/theme';
import { showDialog } from '../../components/Dialog';
import useKeyboardScroll from '../../utils/useKeyboardScroll';

// "mixed" lets the model detect each photo's crop; the farmer can correct it on the results screen.
const CROPS = [
    { id: 'maize', label: 'Maize' },
    { id: 'tomato', label: 'Tomato' },
    { id: 'potato', label: 'Potato' },
    { id: 'mixed', label: 'Not sure / mixed' },
];
// The label under each photo, and the order a tap moves through.
const PHOTO_CROP_LABELS = { maize: 'Maize', tomato: 'Tomato', potato: 'Potato', mixed: 'Not sure' };
const PHOTO_CROP_ORDER = ['maize', 'tomato', 'potato', 'mixed'];
const MAX_PHOTOS = 10; // same limit as the backend

function Label({ title, hint, optional }) {
    return (
        <>
            <Text className="text-base font-bold" style={{ color: COLORS.ink }}>
                {title}
                {optional && (
                    <Text className="font-normal" style={{ color: COLORS.faint }}>
                        {' '}
                        (optional)
                    </Text>
                )}
            </Text>
            {hint && (
                <Text className="text-sm mt-0.5 mb-3 leading-5" style={{ color: COLORS.muted }}>
                    {hint}
                </Text>
            )}
        </>
    );
}

/** A tick-box row: the whole row is the touch target. */
function Tick({ checked, onPress, title, hint }) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            className="flex-row items-start py-2"
        >
            <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? COLORS.brand : COLORS.faint} />
            <View className="flex-1 ml-3">
                <Text className="text-base font-semibold" style={{ color: COLORS.ink }}>
                    {title}
                </Text>
                {hint && (
                    <Text className="text-sm mt-0.5 leading-5" style={{ color: COLORS.muted }}>
                        {hint}
                    </Text>
                )}
            </View>
        </TouchableOpacity>
    );
}

export default function DiagnosisScreen({ navigation }) {
    const scrollRef = useKeyboardScroll();
    const { userToken } = useContext(AuthContext);
    const [crop, setCrop] = useState(null);
    const [photos, setPhotos] = useState([]);
    const [symptoms, setSymptoms] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);
    // Consent is asked every time and is off until the farmer ticks it; the county is remembered.
    const [share, setShare] = useState(false);
    const [contact, setContact] = useState(false);
    const [county, setCounty] = useState(null);

    useEffect(() => {
        loadCounty().then((saved) => saved && setCounty(saved));
    }, []);

    const chooseCounty = (value) => {
        setCounty(value);
        saveCounty(value);
    };

    const toggleShare = () => {
        setShare((on) => !on);
        setContact(false);
    };

    const sharing = share ? { share: true, contact, county } : null;
    const room = MAX_PHOTOS - photos.length;
    const addPhotos = (assets) => setPhotos((current) => [...current, ...assets].slice(0, MAX_PHOTOS));

    const pickFromCamera = async () => {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
            showDialog(
                'Camera access needed',
                'Sproutly needs your camera to photograph the affected leaf. You can enable it in your phone settings.'
            );
            return;
        }
        const result = await ImagePicker.launchCameraAsync({
            // No allowsEditing: the native crop tool has no clear "done" step,
            // so cropping silently doubles as confirmation. The photo comes
            // straight into our own preview, which has an explicit remove button.
            mediaTypes: ['images'],
            // Full quality here; the photo is made smaller and compressed once before upload (shrinkPhoto).
            quality: 1,
        });
        if (!result.canceled) addPhotos(result.assets);
    };

    const pickFromGallery = async () => {
        const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
            showDialog(
                'Photo access needed',
                'Sproutly needs access to your photos to use an existing picture. You can enable it in your phone settings.'
            );
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            // Several leaves at once; each is made smaller before upload (shrinkPhoto), so 10 still go quickly.
            allowsMultipleSelection: true,
            selectionLimit: room,
            quality: 1,
        });
        if (!result.canceled) addPhotos(result.assets);
    };

    const choosePhoto = () => {
        showDialog('Add photos', `You can add ${room} more.`, [
            { text: 'Take photo', onPress: pickFromCamera },
            { text: 'Choose from gallery', onPress: pickFromGallery },
            { text: 'Cancel', style: 'cancel' },
        ]);
    };

    // By position: the same gallery photo can be added twice.
    const removePhoto = (index) => setPhotos((current) => current.filter((_, i) => i !== index));

    // Each photo has its own crop, which is the crop chosen above until the farmer changes it:
    // the farmer knows the crop of each photo better than the model can guess it.
    const cropOf = (photo) => photo.crop || crop;
    const nextPhotoCrop = (index) =>
        setPhotos((current) =>
            current.map((photo, i) => {
                if (i !== index) return photo;
                const at = PHOTO_CROP_ORDER.indexOf(cropOf(photo));
                return { ...photo, crop: PHOTO_CROP_ORDER[(at + 1) % PHOTO_CROP_ORDER.length] };
            })
        );

    // One photo of a known crop keeps the original flow (with symptom text); anything else
    // (several photos, or crop not sure) goes through the batch flow.
    const single = photos.length === 1 && cropOf(photos[0]) && cropOf(photos[0]) !== 'mixed';

    // Several photos: one batch per crop, then the results are put back in photo order.
    const submitByCrop = async (imageUris) => {
        const groups = new Map();
        photos.forEach((photo, index) => {
            const key = cropOf(photo);
            groups.set(key, [...(groups.get(key) || []), index]);
        });
        const merged = [];
        let firstError = null;
        let answered = false; // the backend replied for at least one group
        for (const [key, indexes] of groups) {
            try {
                const { results } = await submitBatch({
                    token: userToken,
                    crop: key === 'mixed' ? null : key,
                    imageUris: indexes.map((i) => imageUris[i]),
                    sharing,
                });
                results.forEach((item) => merged.push({ ...item, index: indexes[item.index] }));
                answered = true;
            } catch (e) {
                // One crop's upload failed: report its photos, keep the others' results.
                firstError = firstError || e;
                indexes.forEach((i) => merged.push({ index: i, error: e.message }));
            }
        }
        // Only a failed upload is an error here. If the backend answered, even with every photo
        // refused (none of them a leaf), the results page shows each photo and why.
        if (!answered) throw firstError;
        return merged.sort((a, b) => a.index - b.index);
    };

    // A ref, not state: two taps in the same instant both saw submitting === false and sent the
    // same photo twice (the duplicate checks in Your checks). The ref is set before anything awaits.
    const sending = useRef(false);

    const handleSubmit = async () => {
        if (sending.current) return;
        sending.current = true;
        setError(null);
        setSubmitting(true);
        try {
            if (single) {
                const result = await submitDiagnosis({
                    token: userToken,
                    crop: cropOf(photos[0]),
                    imageUri: photos[0].uri,
                    symptoms,
                    sharing,
                });
                navigation.navigate('Result', { result, imageUri: photos[0].uri });
            } else {
                const imageUris = photos.map((p) => p.uri);
                const results = await submitByCrop(imageUris);
                navigation.navigate('BatchResult', { results, imageUris });
            }
        } catch (e) {
            setError(toFriendlyError(e));
        } finally {
            sending.current = false;
            setSubmitting(false);
        }
    };

    const canSubmit = crop && photos.length > 0 && !(share && !county) && !submitting;
    const missing =
        !crop && photos.length === 0
            ? 'Choose a crop and add a photo'
            : !crop
              ? 'Choose a crop, or "Not sure / mixed"'
              : photos.length === 0
                ? 'Add a photo'
                : share && !county
                  ? 'Choose your county'
                  : null;
    const buttonLabel = photos.length > 1 ? `Check ${photos.length} photos` : 'Check this leaf';

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <BusyOverlay
                visible={submitting}
                message={photos.length > 1 ? `Checking your ${photos.length} photos` : 'Checking your leaf'}
                detail="This usually takes a few seconds. Please keep the app open."
            />
            <ScreenHeader title="Check a leaf" onBack={() => navigation.goBack()} />
            <KeyboardAvoidingView behavior="padding" className="flex-1">
                <ScrollView ref={scrollRef} contentContainerClassName="px-5 pb-8" keyboardShouldPersistTaps="handled">
                    {/* Crop */}
                    <View className="mt-2">
                        <Label
                            title="Which crop is it?"
                            hint={
                                photos.length > 1
                                    ? "This is every photo's crop. If one photo is a different crop, tap the crop under it to change it."
                                    : crop === 'mixed'
                                      ? "We'll work out the crop. Check it on the result and correct it if it's wrong."
                                      : 'Choosing the crop gives the most reliable result'
                            }
                        />
                        <View className="flex-row flex-wrap">
                            {CROPS.map((item) => {
                                const selected = crop === item.id;
                                return (
                                    <TouchableOpacity
                                        key={item.id}
                                        onPress={() => setCrop(item.id)}
                                        activeOpacity={0.8}
                                        accessibilityRole="radio"
                                        accessibilityState={{ selected }}
                                        className="mr-2 mb-2 px-5 py-2.5 rounded-full"
                                        style={{
                                            backgroundColor: selected ? COLORS.brand : COLORS.surface,
                                            borderWidth: 1,
                                            borderColor: selected ? COLORS.brand : COLORS.divider,
                                        }}
                                    >
                                        <Text
                                            className="text-base font-semibold"
                                            style={{ color: selected ? '#FFFFFF' : COLORS.text }}
                                        >
                                            {item.label}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>

                    {/* Photos */}
                    <View className="mt-6">
                        <Label
                            title={photos.length > 1 ? `Photos (${photos.length} of ${MAX_PHOTOS})` : 'Photo of the affected leaf'}
                            hint="One leaf filling the frame, in daylight, against a plain background. You can add up to 10."
                        />
                        {photos.length === 0 ? (
                            <TouchableOpacity
                                onPress={choosePhoto}
                                activeOpacity={0.8}
                                accessibilityRole="button"
                                className="rounded-xl py-10 items-center"
                                style={{
                                    backgroundColor: COLORS.surface,
                                    borderWidth: 1.5,
                                    borderStyle: 'dashed',
                                    borderColor: '#B9C4BD',
                                }}
                            >
                                <MaterialCommunityIcons name="camera-plus-outline" size={34} color={COLORS.brand} />
                                <Text className="text-base font-semibold mt-2" style={{ color: COLORS.brand }}>
                                    Add photos
                                </Text>
                                <Text className="text-sm mt-0.5" style={{ color: COLORS.muted }}>
                                    Take one now or choose several from your gallery
                                </Text>
                            </TouchableOpacity>
                        ) : (
                            <View className="flex-row flex-wrap -mx-1">
                                {photos.map((photo, index) => (
                                    <View key={`${index}-${photo.uri}`} className="w-1/3 p-1">
                                        <Image source={{ uri: photo.uri }} className="w-full aspect-square rounded-lg" resizeMode="cover" />
                                        {photos.length > 1 && crop && (
                                            <TouchableOpacity
                                                onPress={() => nextPhotoCrop(index)}
                                                accessibilityRole="button"
                                                accessibilityLabel={`Crop of photo ${index + 1}: ${PHOTO_CROP_LABELS[cropOf(photo)]}. Tap to change.`}
                                                className="flex-row items-center justify-center mt-1 py-1.5 rounded-full"
                                                style={{
                                                    borderWidth: 1,
                                                    borderColor: cropOf(photo) !== crop ? COLORS.brand : COLORS.divider,
                                                    backgroundColor: COLORS.surface,
                                                }}
                                            >
                                                <Text
                                                    className="text-sm font-semibold"
                                                    numberOfLines={1}
                                                    maxFontSizeMultiplier={1.3}
                                                    style={{ color: COLORS.brand }}
                                                >
                                                    {PHOTO_CROP_LABELS[cropOf(photo)]}
                                                </Text>
                                                <Ionicons name="swap-horizontal" size={14} color={COLORS.brand} style={{ marginLeft: 4 }} />
                                            </TouchableOpacity>
                                        )}
                                        <TouchableOpacity
                                            onPress={() => removePhoto(index)}
                                            accessibilityRole="button"
                                            accessibilityLabel="Remove photo"
                                            hitSlop={8}
                                            className="absolute top-2 right-2 w-7 h-7 rounded-full items-center justify-center"
                                            style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
                                        >
                                            <Ionicons name="close" size={16} color="#FFFFFF" />
                                        </TouchableOpacity>
                                    </View>
                                ))}
                                {room > 0 && (
                                    <View className="w-1/3 p-1">
                                        <TouchableOpacity
                                            onPress={choosePhoto}
                                            accessibilityRole="button"
                                            className="w-full aspect-square rounded-lg items-center justify-center"
                                            style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B9C4BD' }}
                                        >
                                            <Ionicons name="add" size={28} color={COLORS.brand} />
                                            <Text className="text-sm font-semibold" style={{ color: COLORS.brand }}>
                                                Add
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>

                    {/* Symptoms: one photo of a known crop only, where it belongs to a single diagnosis */}
                    {photos.length <= 1 && crop !== 'mixed' && (
                        <View className="mt-8">
                            <Label title="What are you seeing?" optional hint="Details a photo can't show, such as when it started" />
                            <TextInput
                                className="rounded-xl px-4 py-3 text-base h-28"
                                style={{
                                    backgroundColor: COLORS.surface,
                                    borderWidth: 1,
                                    borderColor: COLORS.divider,
                                    color: COLORS.text,
                                }}
                                placeholder="e.g. Yellow spots started on the lower leaves three days ago, after heavy rain"
                                placeholderTextColor={COLORS.faint}
                                multiline
                                textAlignVertical="top"
                                value={symptoms}
                                onChangeText={setSymptoms}
                            />
                        </View>
                    )}

                    {/* What happens if Sproutly can't be sure: consent, asked each time, off by default */}
                    <View className="mt-8">
                        <Label
                            title="If we can't be sure"
                            optional
                            hint="We won't guess. We'll show you support contacts, and if you agree, an extension officer can look at it. Leave these off and no officer sees your photo or your number."
                        />
                        <Tick
                            checked={share}
                            onPress={toggleShare}
                            title="Send my photo to an extension officer in my county"
                            hint="Only if we can't diagnose it. Their reply appears in Your checks within 7 days."
                        />
                        {share && (
                            <>
                                <Tick
                                    checked={contact}
                                    onPress={() => setContact((on) => !on)}
                                    title="The officer may phone me"
                                    hint="Your number is shared with that officer only."
                                />
                                <View className="mt-2">
                                    <CountyPicker value={county} onChange={chooseCounty} />
                                </View>
                            </>
                        )}
                    </View>
                </ScrollView>

                {/* Pinned at the bottom so the next step is always in reach */}
                <View
                    className="px-5 pt-3 pb-4"
                    style={{ backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: COLORS.divider }}
                >
                    {error && (
                        <View className="mb-3">
                            <ErrorBanner error={error} onRetry={handleSubmit} onDismiss={() => setError(null)} />
                        </View>
                    )}
                    <PrimaryButton
                        label={buttonLabel}
                        loadingLabel={photos.length > 1 ? 'Sending photos…' : 'Sending photo…'}
                        onPress={handleSubmit}
                        disabled={!canSubmit && !submitting}
                        loading={submitting}
                    />
                    {missing && (
                        <Text className="text-sm text-center mt-2" style={{ color: COLORS.muted }}>
                            {missing} to continue
                        </Text>
                    )}
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
