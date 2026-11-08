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

const CROP_ORDER = ['maize', 'tomato', 'potato'];

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
                    The diseases Sproutly can recognise, with what causes them and what to do. Everything is copied
                    from the sources shown on each page.
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
                                        icon={d.healthy ? 'leaf-outline' : 'bug-outline'}
                                        label={d.healthy ? `Keeping ${CROP_LABELS[crop]?.toLowerCase() || crop} healthy` : d.name}
                                        hint={d.healthy ? 'Stopping diseases before they start' : 'Causes, spread and what to do'}
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
