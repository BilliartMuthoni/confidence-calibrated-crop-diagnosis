import React, { useCallback, useContext, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { AuthContext } from '../../context/AuthContext';
import { fetchHistory } from '../../api/DiagnosisService';
import { toFriendlyError } from '../../utils/errorMessages';
import ErrorBanner from '../../components/ErrorBanner';
import BottomBar from '../../components/BottomBar';
import CheckRow, { outcome } from '../../components/CheckRow';
import { COLORS } from '../../constants/theme';

const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'officer', label: 'With an officer' },
    { id: 'disease', label: 'Diseases' },
    { id: 'healthy', label: 'Healthy' },
    { id: 'referred', label: 'Not diagnosed' },
];

/** Every check (the backend keeps the latest 50), with the officer's replies. */
export default function HistoryScreen({ navigation }) {
    const { userToken } = useContext(AuthContext);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState('all');
    const [openReply, setOpenReply] = useState(null);

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

    const shown = history.filter((item) => filter === 'all' || outcome(item).kind === filter);

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
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-4 -mx-5" contentContainerClassName="px-5">
                    {FILTERS.map((f) => {
                        const selected = f.id === filter;
                        return (
                            <TouchableOpacity
                                key={f.id}
                                onPress={() => setFilter(f.id)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected }}
                                className="mr-2 px-4 py-2 rounded-full"
                                style={{
                                    backgroundColor: selected ? COLORS.brand : COLORS.surface,
                                    borderWidth: 1,
                                    borderColor: selected ? COLORS.brand : COLORS.divider,
                                }}
                            >
                                <Text className="text-sm font-semibold" style={{ color: selected ? '#FFFFFF' : COLORS.text }}>
                                    {f.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                <View className="mt-3">
                    {loading ? (
                        <View className="py-10 items-center">
                            <ActivityIndicator color={COLORS.brand} />
                        </View>
                    ) : error ? (
                        <ErrorBanner error={error} onRetry={load} />
                    ) : shown.length === 0 ? (
                        <Text className="text-base py-6 leading-6" style={{ color: COLORS.muted }}>
                            {history.length === 0 ? 'No checks yet. Your results will appear here.' : 'No checks of this kind.'}
                        </Text>
                    ) : (
                        shown.map((item, index) => (
                            <CheckRow
                                key={item.diagnosis_id}
                                item={item}
                                first={index === 0}
                                open={openReply === item.diagnosis_id}
                                onToggle={() => setOpenReply(openReply === item.diagnosis_id ? null : item.diagnosis_id)}
                            />
                        ))
                    )}
                </View>
            </ScrollView>
            <BottomBar navigation={navigation} active="History" />
        </SafeAreaView>
    );
}
