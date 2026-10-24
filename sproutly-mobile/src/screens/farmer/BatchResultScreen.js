import React, { useContext, useState } from 'react';
import { View, Text, ScrollView, Image, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { correctCrop } from '../../api/DiagnosisService';
import { toFriendlyError } from '../../utils/errorMessages';
import ErrorBanner from '../../components/ErrorBanner';
import ScreenHeader from '../../components/ScreenHeader';
import { PrimaryButton } from '../../components/Buttons';
import { COLORS, CROP_LABELS } from '../../constants/theme';

const GROUPS = [
    { key: 'check', title: 'Check the crop' },
    { key: 'maize', title: 'Maize' },
    { key: 'tomato', title: 'Tomato' },
    { key: 'potato', title: 'Potato' },
    { key: 'unclear', title: 'Crop unclear' },
];

// A detected crop the model wasn't sure of goes to "Crop unclear"; a photo that does not look
// like the crop the farmer chose goes to "Check the crop"; everything else by its crop.
// The other crop is never named: the model's guess of the crop is often wrong on new fields.
const groupOf = (result) =>
    result.crop_mismatch ? (result.crop_detected ? 'unclear' : 'check') : result.crop;
const CROP_IDS = ['maize', 'tomato', 'potato'];

function PhotoRow({ item, imageUri, onOpen, onCorrect, busy, error }) {
    const [choosing, setChoosing] = useState(false);
    const { result } = item;
    const referred = result.is_referred;
    const healthy = !referred && result.predicted_disease?.startsWith('Healthy');
    const accent = referred ? COLORS.referral : healthy ? COLORS.healthy : COLORS.disease;
    const group = groupOf(result);
    const unclear = group === 'unclear';

    const pick = (crop) => {
        setChoosing(false);
        onCorrect(crop);
    };

    return (
        <View className="py-3" style={{ borderBottomWidth: 1, borderBottomColor: COLORS.divider }}>
            <TouchableOpacity onPress={onOpen} activeOpacity={0.7} accessibilityRole="button" className="flex-row items-center">
                <Image source={{ uri: imageUri }} className="w-14 h-14 rounded-lg" resizeMode="cover" />
                <View className="flex-1 ml-3">
                    <Text className="text-base font-bold" style={{ color: COLORS.ink }} numberOfLines={1}>
                        {referred ? 'Not diagnosed' : result.predicted_disease}
                    </Text>
                    <Text className="text-sm mt-0.5" style={{ color: accent }}>
                        {referred
                            ? result.sent_to_officer
                                ? 'Sent to a county officer'
                                : 'Use support contacts'
                            : healthy
                              ? 'No disease found'
                              : 'Tap for what to do'}
                    </Text>
                </View>
                {busy ? <ActivityIndicator color={COLORS.brand} /> : <Ionicons name="chevron-forward" size={18} color={COLORS.faint} />}
            </TouchableOpacity>

            {/* Chosen crop, but the photo does not look like it: ask which crop it is. */}
            {group === 'check' && (
                <View className="mt-2 ml-[68px]">
                    <Text className="text-sm leading-5" style={{ color: COLORS.text }}>
                        This does not look like {CROP_LABELS[result.crop].toLowerCase()}. If it is another crop, check it
                        again as that crop. If it is {CROP_LABELS[result.crop].toLowerCase()}, use the support contacts.
                    </Text>
                    <View className="flex-row flex-wrap mt-2">
                        {CROP_IDS.filter((c) => c !== result.crop).map((c) => (
                            <TouchableOpacity
                                key={c}
                                onPress={() => onCorrect(c)}
                                disabled={busy}
                                accessibilityRole="button"
                                className="mr-2 mb-2 px-4 py-2 rounded-full"
                                style={{ backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.brand }}
                            >
                                <Text className="text-sm font-semibold" style={{ color: COLORS.brand }}>
                                    It is {CROP_LABELS[c].toLowerCase()}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}

            {/* The model guessed a crop it was sure of: the farmer confirms or changes it. */}
            {result.crop_detected && !unclear && (
                <View className="flex-row flex-wrap items-center mt-2 ml-[68px]">
                    <Text className="text-sm mr-2" style={{ color: COLORS.text }}>
                        {referred ? 'Crop guess' : 'Detected as'}: {CROP_LABELS[result.crop]}. Is that right?
                    </Text>
                    <TouchableOpacity
                        onPress={() => onCorrect(result.crop)}
                        disabled={busy}
                        accessibilityRole="button"
                        className="mr-2 px-3 py-1.5 rounded-full"
                        style={{ borderWidth: 1, borderColor: COLORS.brand }}
                    >
                        <Text className="text-sm font-bold" style={{ color: COLORS.brand }}>
                            Yes
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setChoosing((v) => !v)}
                        disabled={busy}
                        accessibilityRole="button"
                        className="px-3 py-1.5 rounded-full"
                        style={{ borderWidth: 1, borderColor: COLORS.divider }}
                    >
                        <Text className="text-sm font-bold" style={{ color: COLORS.brand }}>
                            Change
                        </Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* The model could not tell the crop: the farmer chooses it. */}
            {unclear && (
                <TouchableOpacity
                    onPress={() => setChoosing((v) => !v)}
                    disabled={busy}
                    accessibilityRole="button"
                    className="flex-row items-center self-start mt-2 ml-[68px] px-3 py-1.5 rounded-full"
                    style={{ borderWidth: 1, borderColor: COLORS.referral }}
                >
                    <Text className="text-sm" style={{ color: COLORS.text }}>
                        Crop unclear
                    </Text>
                    <Text className="text-sm font-bold ml-2" style={{ color: COLORS.brand }}>
                        Choose crop
                    </Text>
                </TouchableOpacity>
            )}
            {choosing && (
                <View className="flex-row ml-[68px] mt-2">
                    {CROP_IDS.map((crop) => (
                        <TouchableOpacity
                            key={crop}
                            onPress={() => pick(crop)}
                            accessibilityRole="button"
                            className="mr-2 px-4 py-2 rounded-full"
                            style={{ backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.brand }}
                        >
                            <Text className="text-sm font-semibold" style={{ color: COLORS.brand }}>
                                {CROP_LABELS[crop]}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
            {error && (
                <View className="mt-2 ml-[68px]">
                    <ErrorBanner error={error} />
                </View>
            )}
        </View>
    );
}

export default function BatchResultScreen({ route, navigation }) {
    const { userToken } = useContext(AuthContext);
    const { imageUris } = route.params;
    const [items, setItems] = useState(route.params.results);
    const [busyIndex, setBusyIndex] = useState(null);
    const [rowErrors, setRowErrors] = useState({});

    const checked = items.filter((i) => i.result);
    const failed = items.filter((i) => !i.result);
    const referredCount = checked.filter((i) => i.result.is_referred).length;

    const correct = async (item, crop) => {
        setBusyIndex(item.index);
        setRowErrors((e) => ({ ...e, [item.index]: null }));
        try {
            const result = await correctCrop({ token: userToken, diagnosisId: item.result.diagnosis_id, crop });
            setItems((current) => current.map((i) => (i.index === item.index ? { ...i, result } : i)));
        } catch (e) {
            setRowErrors((errs) => ({ ...errs, [item.index]: toFriendlyError(e) }));
        } finally {
            setBusyIndex(null);
        }
    };

    const home = () => navigation.popToTop();

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title="Results" icon="close" onBack={home} />
            <ScrollView contentContainerClassName="px-5 pb-10">
                <Text className="text-sm" style={{ color: COLORS.muted }}>
                    {checked.length} {checked.length === 1 ? 'photo' : 'photos'} checked · {checked.length - referredCount}{' '}
                    diagnosed · {referredCount} referred
                </Text>

                {GROUPS.map((group) => {
                    const members = checked.filter((i) => groupOf(i.result) === group.key);
                    if (members.length === 0) return null;
                    return (
                        <View key={group.key} className="mt-6">
                            <Text className="text-xs font-bold tracking-wider" style={{ color: COLORS.muted }}>
                                {group.title.toUpperCase()} ({members.length})
                            </Text>
                            {members.map((item) => (
                                <PhotoRow
                                    key={item.index}
                                    item={item}
                                    imageUri={imageUris[item.index]}
                                    busy={busyIndex === item.index}
                                    error={rowErrors[item.index]}
                                    onOpen={() => navigation.navigate('Result', { result: item.result, imageUri: imageUris[item.index] })}
                                    onCorrect={(crop) => correct(item, crop)}
                                />
                            ))}
                        </View>
                    );
                })}

                {failed.length > 0 && (
                    <View className="mt-6">
                        <Text className="text-xs font-bold tracking-wider" style={{ color: COLORS.muted }}>
                            NOT CHECKED ({failed.length})
                        </Text>
                        {failed.map((item) => (
                            <View key={item.index} className="flex-row items-center py-3" style={{ borderBottomWidth: 1, borderBottomColor: COLORS.divider }}>
                                <Image source={{ uri: imageUris[item.index] }} className="w-14 h-14 rounded-lg" resizeMode="cover" />
                                <Text className="text-sm flex-1 ml-3 leading-5" style={{ color: COLORS.text }}>
                                    {toFriendlyError(item.error).message}
                                </Text>
                            </View>
                        ))}
                    </View>
                )}

                <View className="mt-8">
                    <PrimaryButton label="Done" onPress={home} />
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
