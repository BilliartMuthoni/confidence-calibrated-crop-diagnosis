import React, { useCallback, useContext, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { fetchHistory } from '../../api/DiagnosisService';
import { toFriendlyError } from '../../utils/errorMessages';
import { loadSeenReplies } from '../../utils/seenReplies';
import { parseUtc, whenLabel } from '../../utils/time';
import ErrorBanner from '../../components/ErrorBanner';
import ScreenHeader from '../../components/ScreenHeader';
import { COLORS, CROP_LABELS } from '../../constants/theme';

/** What a notice is about: today, an officer's reply to a referred check. Push notifications
 *  (after the 31 Oct report) will open this same screen. */
export function officerReplies(history) {
    const replied = history.filter((item) => item.officer_response);
    const at = (item) => parseUtc(item.responded_at || item.created_at).getTime();
    return replied.sort((a, b) => at(b) - at(a));
}

/** The bell's list: newest first, unread in bold with a dot; opening one marks it read. */
export default function NotificationsScreen({ navigation }) {
    const { userToken } = useContext(AuthContext);
    const [replies, setReplies] = useState([]);
    const [seen, setSeen] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const [checks, opened] = await Promise.all([fetchHistory({ token: userToken }), loadSeenReplies()]);
            setReplies(officerReplies(checks));
            setSeen(opened);
        } catch (e) {
            setError(toFriendlyError(e));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [userToken]);

    // Reloads on return, so a notice just opened shows as read.
    useFocusEffect(
        useCallback(() => {
            load();
        }, [load])
    );

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title="Notifications" onBack={() => navigation.goBack()} />
            <ScrollView
                contentContainerClassName="px-5 pb-10"
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
            >
                {loading ? (
                    <View className="py-10 items-center">
                        <ActivityIndicator color={COLORS.brand} />
                    </View>
                ) : error ? (
                    <ErrorBanner error={error} onRetry={load} />
                ) : replies.length === 0 ? (
                    <View className="items-center py-14">
                        <Ionicons name="notifications-outline" size={40} color={COLORS.faint} />
                        <Text className="text-base font-bold mt-3" style={{ color: COLORS.ink }}>
                            No notifications yet
                        </Text>
                        <Text className="text-sm text-center mt-1 leading-5" style={{ color: COLORS.muted }}>
                            When a county officer replies to a case you shared, it appears here.
                        </Text>
                    </View>
                ) : (
                    replies.map((item, index) => {
                        const unread = !seen.has(item.diagnosis_id);
                        const crop = (CROP_LABELS[item.crop] || item.crop).toLowerCase();
                        return (
                            <TouchableOpacity
                                key={item.diagnosis_id}
                                onPress={() => navigation.navigate('Result', { diagnosisId: item.diagnosis_id })}
                                accessibilityRole="button"
                                accessibilityLabel={`${unread ? 'New. ' : ''}A county officer replied about your ${crop} check. Open it`}
                                className="flex-row items-start py-4"
                                style={{ borderTopWidth: index === 0 ? 0 : 1, borderTopColor: COLORS.divider }}
                            >
                                <View className="w-9 h-9 rounded-full items-center justify-center" style={{ backgroundColor: '#EAF1F8' }}>
                                    <Ionicons name="chatbubble-ellipses" size={17} color={COLORS.referral} />
                                </View>
                                <View className="flex-1 ml-3">
                                    <Text className="text-base leading-6" style={{ color: COLORS.ink, fontWeight: unread ? '700' : '400' }}>
                                        A county officer replied about your {crop} check
                                    </Text>
                                    <Text className="text-xs mt-0.5" style={{ color: COLORS.muted }}>
                                        {whenLabel(item.responded_at || item.created_at)}
                                    </Text>
                                </View>
                                {unread && (
                                    <View className="w-2.5 h-2.5 rounded-full mt-2 ml-2" style={{ backgroundColor: COLORS.referral }}
                                          accessibilityElementsHidden />
                                )}
                            </TouchableOpacity>
                        );
                    })
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
