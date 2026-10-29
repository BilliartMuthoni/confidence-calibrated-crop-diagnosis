import React, { useCallback, useContext, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { AuthContext } from '../../context/AuthContext';
import { fetchHistory } from '../../api/DiagnosisService';
import { toFriendlyError } from '../../utils/errorMessages';
import { parseUtc, startOfMonth, startOfWeek } from '../../utils/time';
import ErrorBanner from '../../components/ErrorBanner';
import BottomBar from '../../components/BottomBar';
import CheckRow from '../../components/CheckRow';
import FilterSheet, { FilterButton } from '../../components/FilterSheet';
import { COLORS, CROP_LABELS } from '../../constants/theme';

// Non-breaking spaces ( ): Android split "This week" after "This" and hid the second line.
const PERIODS = [
    { id: 'all', label: 'All time', from: () => null },
    { id: 'week', label: 'This week', from: startOfWeek },
    { id: 'month', label: 'This month', from: startOfMonth },
];

const CROPS = [{ id: 'all', label: 'All crops' }, ...Object.entries(CROP_LABELS).map(([id, label]) => ({ id, label }))];

// What the check found. Whether an officer replied is a separate question (a switch on the same
// sheet, and a badge on each row), not one of these: a case can be "not diagnosed" and answered.
const RESULTS = [
    { id: 'all', label: 'All results', short: 'All', matches: () => true },
    { id: 'disease', label: 'Disease found', short: 'Disease', matches: (item) => !item.is_referred && !outcomeIsHealthy(item) },
    { id: 'healthy', label: 'Healthy', short: 'Healthy', matches: (item) => !item.is_referred && outcomeIsHealthy(item) },
    { id: 'referred', label: 'Not diagnosed', short: 'Not diagnosed', matches: (item) => item.is_referred },
];

function outcomeIsHealthy(item) {
    return Boolean(item.predicted_disease?.startsWith('Healthy'));
}

/** Every check (the backend keeps the latest 50); tapping one opens its full result. */
export default function HistoryScreen({ navigation }) {
    const { userToken } = useContext(AuthContext);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [period, setPeriod] = useState('all');
    const [crop, setCrop] = useState('all');
    const [result, setResult] = useState('all');
    const [repliedOnly, setRepliedOnly] = useState(false);
    const [sheet, setSheet] = useState(null); // 'crop' | 'result' | null

    const load = useCallback(async () => {
        setError(null);
        try {
            setHistory(await fetchHistory({ token: userToken }));
        } catch (e) {
            setError(toFriendlyError(e));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [userToken]);

    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    const from = PERIODS.find((p) => p.id === period).from();
    const resultFilter = RESULTS.find((r) => r.id === result);
    const shown = history.filter(
        (item) =>
            (!from || parseUtc(item.created_at) >= from) &&
            (crop === 'all' || item.crop === crop) &&
            resultFilter.matches(item) &&
            (!repliedOnly || Boolean(item.officer_response))
    );
    const filtered = period !== 'all' || crop !== 'all' || result !== 'all' || repliedOnly;
    const clear = () => {
        setPeriod('all');
        setCrop('all');
        setResult('all');
        setRepliedOnly(false);
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top']}>
            <StatusBar style="dark" />
            <ScrollView
                contentContainerClassName="px-5 pb-10"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
            >
                <Text className="text-2xl font-bold pt-4" style={{ color: COLORS.ink }}>
                    Your checks
                </Text>

                <View
                    className="flex-row mt-4 rounded-xl p-1"
                    style={{ backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.divider }}
                    accessibilityRole="radiogroup"
                    accessibilityLabel="When"
                >
                    {PERIODS.map((p) => {
                        const selected = p.id === period;
                        return (
                            <TouchableOpacity
                                key={p.id}
                                onPress={() => setPeriod(p.id)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected }}
                                className="items-center py-2 px-1 rounded-lg"
                                style={{ flex: 1, flexBasis: 0, backgroundColor: selected ? COLORS.brand : 'transparent' }}
                            >
                                <Text className="text-sm font-semibold" numberOfLines={1} maxFontSizeMultiplier={1.2}
                                      style={{ color: selected ? '#FFFFFF' : COLORS.text }}>
                                    {p.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <View className="flex-row flex-wrap items-center mt-3">
                    <FilterButton label="Crop" value={CROPS.find((c) => c.id === crop).label.replace('All crops', 'All')}
                                  active={crop !== 'all'} onPress={() => setSheet('crop')} />
                    <FilterButton label="Result"
                                  value={`${resultFilter.short}${repliedOnly ? ', replied' : ''}`}
                                  active={result !== 'all' || repliedOnly} onPress={() => setSheet('result')} />
                    {!loading && !error && (
                        <Text className="ml-auto text-sm" style={{ color: COLORS.muted }}>
                            {shown.length} {shown.length === 1 ? 'check' : 'checks'}
                        </Text>
                    )}
                </View>

                <View className="mt-3">
                    {loading ? (
                        <View className="py-10 items-center">
                            <ActivityIndicator color={COLORS.brand} />
                        </View>
                    ) : error ? (
                        <ErrorBanner error={error} onRetry={load} />
                    ) : shown.length === 0 ? (
                        <View className="py-6">
                            <Text className="text-base leading-6" style={{ color: COLORS.muted }}>
                                {history.length === 0 ? 'No checks yet. Your results will appear here.' : 'No checks match these filters.'}
                            </Text>
                            {filtered && history.length > 0 && (
                                <Text className="text-base font-bold mt-3" style={{ color: COLORS.brand }} onPress={clear} accessibilityRole="button">
                                    Show all checks
                                </Text>
                            )}
                        </View>
                    ) : (
                        shown.map((item, index) => (
                            <CheckRow
                                key={item.diagnosis_id}
                                item={item}
                                first={index === 0}
                                onPress={() => navigation.navigate('Result', { diagnosisId: item.diagnosis_id })}
                            />
                        ))
                    )}
                </View>
            </ScrollView>
            <FilterSheet visible={sheet === 'crop'} title="Crop" options={CROPS} value={crop}
                         onChange={setCrop} onClose={() => setSheet(null)} />
            <FilterSheet
                visible={sheet === 'result'}
                title="Result"
                options={RESULTS}
                value={result}
                onChange={setResult}
                toggle={{ label: "Only checks with an officer's reply", value: repliedOnly, onChange: setRepliedOnly }}
                onClose={() => setSheet(null)}
            />
            <BottomBar navigation={navigation} active="History" />
        </SafeAreaView>
    );
}
