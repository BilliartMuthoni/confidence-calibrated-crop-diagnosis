import React, { useCallback, useContext, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { fetchHistory } from '../../api/DiagnosisService';
import { toFriendlyError } from '../../utils/errorMessages';
import ErrorBanner from '../../components/ErrorBanner';
import BottomBar from '../../components/BottomBar';
import CheckRow from '../../components/CheckRow';
import { COLORS } from '../../constants/theme';

// Home shows the latest few; the full list is on the Your checks tab.
const LATEST = 3;

export default function FarmerDashboard({ navigation }) {
    const { userToken } = useContext(AuthContext);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);
    // The check whose officer reply is open.
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

    // Reload whenever the home screen comes back into view, e.g. after a new check.
    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    const refresh = () => {
        setRefreshing(true);
        load();
    };

    const seeAll = () => navigation.reset({ index: 1, routes: [{ name: 'FarmerHome' }, { name: 'History', params: { tab: true } }] });

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top']}>
            <StatusBar style="dark" />
            <ScrollView
                contentContainerClassName="px-5 pb-10"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
            >
                {/* Header */}
                {/* Profile and settings live in the Account tab. */}
                <View className="flex-row items-center pt-4">
                    <Text className="text-2xl font-bold" style={{ color: COLORS.brand }}>
                        Sproutly
                    </Text>
                </View>
                <Text className="text-base mt-1" style={{ color: COLORS.muted }}>
                    What is affecting your crop today?
                </Text>

                {/* The one main action */}
                <TouchableOpacity
                    onPress={() => navigation.navigate('Diagnosis')}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    className="mt-6 rounded-2xl px-5 py-6 flex-row items-center"
                    style={{ backgroundColor: COLORS.brand }}
                >
                    <MaterialCommunityIcons name="camera-outline" size={30} color="#FFFFFF" />
                    <View className="flex-1 ml-4">
                        <Text className="text-white text-xl font-bold">Check a leaf</Text>
                        <Text className="text-sm mt-0.5" style={{ color: 'rgba(255,255,255,0.75)' }}>
                            Maize, tomato or potato
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.75)" />
                </TouchableOpacity>

                {/* Latest checks */}
                <View className="flex-row items-center justify-between mt-10 mb-1">
                    <Text className="text-lg font-bold" style={{ color: COLORS.ink }}>
                        Latest checks
                    </Text>
                    {history.length > LATEST && (
                        <TouchableOpacity onPress={seeAll} hitSlop={8} accessibilityRole="button">
                            <Text className="text-base font-semibold" style={{ color: COLORS.brand }}>
                                See all ({history.length})
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>

                {loading ? (
                    <View className="py-10 items-center">
                        <ActivityIndicator color={COLORS.brand} />
                    </View>
                ) : error ? (
                    <View className="mt-3">
                        <ErrorBanner error={error} onRetry={load} />
                    </View>
                ) : history.length === 0 ? (
                    <Text className="text-base py-6 leading-6" style={{ color: COLORS.muted }}>
                        No checks yet. Your results will appear here.
                    </Text>
                ) : (
                    history.slice(0, LATEST).map((item, index) => (
                        <CheckRow
                            key={item.diagnosis_id}
                            item={item}
                            first={index === 0}
                            open={openReply === item.diagnosis_id}
                            onToggle={() => setOpenReply(openReply === item.diagnosis_id ? null : item.diagnosis_id)}
                        />
                    ))
                )}
            </ScrollView>
            <BottomBar navigation={navigation} active="FarmerHome" />
        </SafeAreaView>
    );
}
