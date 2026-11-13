import React, { useCallback, useContext, useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthContext } from '../../context/AuthContext';
import { fetchLibrary } from '../../api/DiagnosisService';
import { toFriendlyError } from '../../utils/errorMessages';
import ScreenHeader from '../../components/ScreenHeader';
import ErrorBanner from '../../components/ErrorBanner';
import { Group, NavRow } from '../../components/SettingsRows';
import SavedCopyNote from '../../components/SavedCopyNote';
import { COLORS, CROP_LABELS } from '../../constants/theme';
import { shortDiseaseLabel } from '../../utils/diseaseName';

const CROP_ORDER = ['maize', 'tomato', 'potato'];

// What each disease looks like, so the rows can be told apart at a glance. Short versions of
// the sourced symptom sentences in ml/data/symptoms (Plantwise and PlantVillage fact sheets).
const LOOKS_LIKE = {
    'Corn_(maize)___Common_rust_': 'Brown powdery spots on both sides of the leaf',
    'Corn_(maize)___Cercospora_leaf_spot Gray_leaf_spot': 'Long rectangular spots along the veins',
    'Corn_(maize)___Northern_Leaf_Blight': 'Long, narrow grey-green to tan patches',
    'Tomato___Bacterial_spot': 'Small wet-looking spots on leaves and fruit',
    'Tomato___Early_blight': 'Brown spots with rings, from the lower leaves up',
    'Tomato___Late_blight': 'Brown to black patches that spread fast',
    'Potato___Early_blight': 'Dark spots with rings and a yellow edge',
    'Potato___Late_blight': 'Dark patches that spread and rot leaves and tubers',
};

// Under the MAIZE heading "Maize Common Rust" reads "Common rust": the crop is already the
// heading, and the app uses sentence case. The detail page keeps the full name.
const shortName = shortDiseaseLabel;

/**
 * Disease library (g08): the diseases Sproutly can recognise, by crop, each with its sourced
 * advice. The same grouped rows as the Account screen. General information, not a diagnosis.
 */
export default function LibraryScreen({ navigation }) {
    const { userToken } = useContext(AuthContext);
    const [items, setItems] = useState(null);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            setItems(await fetchLibrary({ token: userToken }));
        } catch (e) {
            setError(toFriendlyError(e));
        }
    }, [userToken]);

    useEffect(() => {
        load();
    }, [load]);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title="Disease library" onBack={() => navigation.goBack()} />
            <ScrollView contentContainerClassName="pb-10">
                <Text className="text-base leading-6 px-5 mt-1" style={{ color: COLORS.muted }}>
                    Learn what causes each disease, how it spreads and what to do.
                </Text>
                {items?.savedCopy && (
                    <View className="px-5">
                        <SavedCopyNote what="the library" />
                    </View>
                )}
                {error ? (
                    <View className="px-5 mt-4">
                        <ErrorBanner error={error} onRetry={load} />
                    </View>
                ) : !items ? (
                    <View className="py-10 items-center">
                        <ActivityIndicator color={COLORS.brand} />
                    </View>
                ) : (
                    CROP_ORDER.map((crop) => {
                        const rows = items.filter((d) => d.crop === crop);
                        return (
                            <Group key={crop} title={CROP_LABELS[crop] || crop}>
                                {rows.map((d, index) => (
                                    <NavRow
                                        key={d.class_name}
                                        label={d.healthy ? `Keeping ${CROP_LABELS[crop]?.toLowerCase() || crop} healthy` : shortName(d.name)}
                                        hint={d.healthy ? 'How to prevent these diseases' : LOOKS_LIKE[d.class_name]}
                                        onPress={() => navigation.navigate('LibraryDisease', { disease: d })}
                                        last={index === rows.length - 1}
                                    />
                                ))}
                            </Group>
                        );
                    })
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
