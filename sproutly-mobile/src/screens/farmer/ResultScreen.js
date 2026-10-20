import React from 'react';
import { View, Text, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../../components/ScreenHeader';
import { PrimaryButton, SecondaryButton, TextButton } from '../../components/Buttons';
import { COLORS, CROP_LABELS } from '../../constants/theme';

/** A titled, numbered list separated from what comes before by a thin rule. */
function Steps({ title, items }) {
    if (!items?.length) return null;
    return (
        <View className="mt-6 pt-5" style={{ borderTopWidth: 1, borderTopColor: COLORS.divider }}>
            <Text className="text-base font-bold mb-3" style={{ color: COLORS.ink }}>
                {title}
            </Text>
            {items.map((step, index) => (
                <View key={index} className="flex-row mb-3">
                    <Text className="text-base font-bold w-6" style={{ color: COLORS.faint }}>
                        {index + 1}
                    </Text>
                    <Text className="text-base flex-1 leading-6" style={{ color: COLORS.text }}>
                        {step}
                    </Text>
                </View>
            ))}
        </View>
    );
}

export default function ResultScreen({ route, navigation }) {
    const { result, imageUri } = route.params;
    const referred = result.is_referred;
    const cropLabel = CROP_LABELS[result.crop] || result.crop;
    const crop = cropLabel.toLowerCase();
    const healthy = !referred && result.predicted_disease?.startsWith('Healthy');

    const accent = referred ? COLORS.referral : healthy ? COLORS.healthy : COLORS.disease;
    const status = referred ? 'Not diagnosed' : healthy ? 'No disease found' : 'Diagnosis';
    const title = referred ? "We couldn't diagnose this reliably" : result.predicted_disease;

    const home = () => navigation.popToTop();
    const openSupport = () => navigation.navigate('SupportContacts');

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title="Result" icon="close" onBack={home} />
            <ScrollView contentContainerClassName="pb-10">
                {imageUri && <Image source={{ uri: imageUri }} className="w-full h-56" resizeMode="cover" />}

                <View className="px-5 pt-5">
                    <Text className="text-xs font-bold tracking-wider" style={{ color: accent }}>
                        {cropLabel.toUpperCase()} · {status.toUpperCase()}
                    </Text>
                    <Text className="text-2xl font-bold mt-1" style={{ color: COLORS.ink }}>
                        {title}
                    </Text>

                    {referred ? (
                        <>
                            {result.sent_to_officer ? (
                                <View
                                    className="mt-4 rounded-xl px-4 py-3 flex-row"
                                    style={{ backgroundColor: '#EAF1F8', borderWidth: 1, borderColor: '#C9DAEC' }}
                                >
                                    <Text className="flex-1 ml-3 text-base leading-6" style={{ color: COLORS.text }}>
                                        <Text className="font-bold">Sent to an extension officer in your county.</Text>{' '}
                                        Their reply will appear under Your checks within 7 days. If nobody replies,
                                        use the support contacts.
                                    </Text>
                                </View>
                            ) : (
                                <Text className="text-base mt-3 leading-6" style={{ color: COLORS.text }}>
                                    {result.referral_message}
                                </Text>
                            )}
                            {result.crop_mismatch && (
                                <Text className="text-base mt-3 leading-6" style={{ color: COLORS.text }}>
                                    We could not diagnose this as <Text className="font-bold">{crop}</Text>. If this is
                                    not a {crop} leaf, choose the correct crop and try again. If it is {crop}, use the
                                    support contacts below.
                                </Text>
                            )}
                            <View className="mt-6 pt-5" style={{ borderTopWidth: 1, borderTopColor: COLORS.divider }}>
                                <Text className="text-base font-bold mb-2" style={{ color: COLORS.ink }}>
                                    Before you treat
                                </Text>
                                <Text className="text-base leading-6" style={{ color: COLORS.text }}>
                                    Avoid spraying anything until you have an answer. Treating the wrong problem costs
                                    money and can make the crop worse.
                                </Text>
                            </View>
                        </>
                    ) : (
                        <>
                            {result.guidance?.summary && (
                                <Text className="text-base mt-3 leading-6" style={{ color: COLORS.text }}>
                                    {result.guidance.summary}
                                </Text>
                            )}
                            <Steps title="What to do now" items={result.guidance?.treatment} />
                            <Steps title="Stopping it coming back" items={result.guidance?.prevention} />
                        </>
                    )}
                </View>

                <View className="px-5 mt-8">
                    {referred ? (
                        <>
                            <PrimaryButton
                                label="Support contacts"
                                icon="call-outline"
                                color={COLORS.referral}
                                onPress={openSupport}
                            />
                            {result.crop_mismatch && (
                                // The diagnose screen still holds the photo, so going back is all a retry needs.
                                <SecondaryButton label="Choose a different crop" onPress={() => navigation.goBack()} />
                            )}
                            <TextButton label="Back to home" onPress={home} />
                        </>
                    ) : (
                        <>
                            <PrimaryButton label="Done" onPress={home} />
                            <Text className="text-sm text-center mt-4 leading-5" style={{ color: COLORS.muted }}>
                                Not matching what you see?{' '}
                                <Text className="font-bold" style={{ color: COLORS.brand }} onPress={openSupport}>
                                    Support contacts
                                </Text>
                            </Text>
                        </>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}
