import React from 'react';
import { View, Text, ScrollView, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from '../../components/ScreenHeader';
import { PrimaryButton } from '../../components/Buttons';
import { COLORS, CROP_LABELS } from '../../constants/theme';

/** A titled, numbered list: the same look as "What to do now" on a result. */
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

/** "Title (licence): link": the title opens the source. */
function Sources({ items }) {
    if (!items?.length) return null;
    return (
        <View className="mt-6 pt-5" style={{ borderTopWidth: 1, borderTopColor: COLORS.divider }}>
            <Text className="text-sm font-bold mb-2" style={{ color: COLORS.muted }}>
                Where this comes from (tap a source to open it)
            </Text>
            {items.map((source) => {
                const at = source.lastIndexOf(': http');
                const label = at > 0 ? source.slice(0, at) : source;
                const url = at > 0 ? source.slice(at + 2) : null;
                return (
                    <Text
                        key={source}
                        className="text-sm leading-5 mb-2"
                        style={{ color: url ? COLORS.brand : COLORS.muted, textDecorationLine: url ? 'underline' : 'none' }}
                        onPress={url ? () => Linking.openURL(url) : undefined}
                        accessibilityRole={url ? 'link' : undefined}
                    >
                        {label}
                    </Text>
                );
            })}
        </View>
    );
}

/** One disease in the library (g08). Route params: disease (from GET /library). */
export default function LibraryDiseaseScreen({ route, navigation }) {
    const { disease } = route.params;
    const cropLabel = CROP_LABELS[disease.crop] || disease.crop;
    const title = disease.healthy ? `Keeping ${cropLabel.toLowerCase()} healthy` : disease.name;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title="Disease library" onBack={() => navigation.goBack()} />
            <ScrollView contentContainerClassName="px-5 pb-6">
                <Text className="text-xs font-bold tracking-wider" style={{ color: disease.healthy ? COLORS.healthy : COLORS.disease }}>
                    {cropLabel.toUpperCase()}
                </Text>
                <Text className="text-2xl font-bold mt-1" style={{ color: COLORS.ink }}>
                    {title}
                </Text>
                <Text className="text-sm leading-5 mt-2" style={{ color: COLORS.muted }}>
                    General information from the sources below, not a diagnosis. To know what is on your crop, check a
                    leaf or ask your extension officer.
                </Text>

                {disease.warning && (
                    // The same card as on a late blight result (n20).
                    <View className="mt-5 rounded-xl px-4 py-3" style={{ backgroundColor: '#FDF1E8', borderWidth: 1, borderColor: COLORS.disease }}>
                        <View className="flex-row items-start">
                            <Ionicons name="warning-outline" size={20} color={COLORS.disease} />
                            <Text className="flex-1 ml-2 text-base font-semibold leading-6" style={{ color: COLORS.ink }}>
                                {disease.warning}
                            </Text>
                        </View>
                    </View>
                )}

                <Steps title="About this disease" items={disease.about} />
                <Steps title="What to do" items={disease.treatment} />
                <Steps title={disease.healthy ? 'How to keep it healthy' : 'Stopping it coming back'} items={disease.prevention} />
                <Steps title="Harvest and storage" items={disease.harvest} />
                {!disease.healthy && disease.treatment?.length > 0 && (
                    // As on a result: sprays are never named or dosed in the app.
                    <Text className="text-base leading-6 mt-2" style={{ color: COLORS.text }}>
                        <Text className="font-bold">Before using any chemical:</Text> use a product registered for this
                        disease, follow its label, and ask your agrovet or extension officer.
                    </Text>
                )}
                <Sources items={disease.sources} />
            </ScrollView>
            <View className="px-5 pt-3 pb-4" style={{ backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: COLORS.divider }}>
                <PrimaryButton label="Check a leaf" onPress={() => navigation.navigate('Diagnosis')} />
            </View>
        </SafeAreaView>
    );
}
