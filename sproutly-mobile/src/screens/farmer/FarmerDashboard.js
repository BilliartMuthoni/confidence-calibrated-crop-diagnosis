import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { fetchHistory, submitBatch, submitDiagnosis } from '../../api/DiagnosisService';
import { acceptTerms, fetchCurrentUser } from '../../api/AuthService';
import { showDialog } from '../../components/Dialog';
import { toFriendlyError } from '../../utils/errorMessages';
import ErrorBanner from '../../components/ErrorBanner';
import BottomBar from '../../components/BottomBar';
import CheckRow from '../../components/CheckRow';
import { COLORS } from '../../constants/theme';
import { loadSeenReplies } from '../../utils/seenReplies';
import QueueCard from '../../components/QueueCard';
import SavedCopyNote from '../../components/SavedCopyNote';
import { loadQueue, removeFromQueue, sendQueue, watchQueue } from '../../utils/offlineQueue';

// Home shows the latest few; the full list is on the Your checks tab.
const LATEST = 3;
export default function FarmerDashboard({ navigation }) {
    const { userToken } = useContext(AuthContext);
    const [history, setHistory] = useState([]);
    const [seen, setSeen] = useState(new Set());
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(null);

    // Terms (t50): accounts from before the tick-box, Google sign-ups and everyone after the terms
    // change are asked once. Reading the pages closes the pop-up; agreeing there saves it, and
    // coming back without agreeing asks again.
    const askingTerms = useRef(false);
    const checkTerms = useCallback(async () => {
        if (askingTerms.current) return;
        try {
            const me = await fetchCurrentUser({ token: userToken });
            if (me.terms_current !== false || askingTerms.current) return;
            askingTerms.current = true;
            const done = () => { askingTerms.current = false; };
            showDialog(
                'Terms of use and Privacy policy',
                'Please read and agree to the Terms of use and Privacy policy to keep using Sproutly.',
                [
                    { text: 'I agree', onPress: () => acceptTerms({ token: userToken }).catch(() => {}).finally(done) },
                    // Both pages as tabs, with "I agree to both" at the bottom.
                    { text: 'Read them first', style: 'cancel', onPress: () => { done(); navigation.navigate('Info', { page: 'terms', agree: 'home' }); } },
                ],
            );
        } catch {
            // No signal: ask next time Home opens.
        }
    }, [userToken, navigation]);

    const load = useCallback(async () => {
        setError(null);
        checkTerms();
        try {
            const [checks, opened] = await Promise.all([fetchHistory({ token: userToken }), loadSeenReplies()]);
            setHistory(checks);
            setSeen(opened);
        } catch (e) {
            setError(toFriendlyError(e));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [userToken, checkTerms]);

    // Checks saved with no signal (g07): shown here and sent by themselves when there is signal.
    const [queue, setQueue] = useState([]);
    const [sendingQueue, setSendingQueue] = useState(false);
    useEffect(() => {
        loadQueue().then(setQueue);
        return watchQueue(setQueue);
    }, []);

    const sendItem = useCallback(
        async (item) => {
            if (item.crop) {
                return submitDiagnosis({
                    token: userToken,
                    crop: item.crop,
                    imageUri: item.uri,
                    symptoms: item.symptoms,
                    sharing: item.sharing,
                    clientId: item.id,
                });
            }
            // Crop not chosen ("Not sure"): the server detects it, as for several photos.
            const { results } = await submitBatch({
                token: userToken,
                crop: null,
                imageUris: [item.uri],
                sharing: item.sharing,
                clientIds: [item.id],
            });
            if (results[0]?.error) throw new Error(results[0].error);
            return results[0].result;
        },
        [userToken]
    );

    const trySending = useCallback(async () => {
        if (!(await loadQueue()).some((i) => !i.error)) return;
        setSendingQueue(true);
        try {
            const { sent } = await sendQueue(sendItem);
            if (sent) load(); // the new results appear under Recent checks
        } finally {
            setSendingQueue(false);
        }
    }, [sendItem, load]);

    // Reload whenever the home screen comes back into view, e.g. after a new check; while Home is
    // open, waiting checks are tried again every minute.
    useFocusEffect(
        useCallback(() => {
            load();
            trySending();
            const timer = setInterval(trySending, 60000);
            return () => clearInterval(timer);
        }, [load, trySending])
    );

    const refresh = () => {
        setRefreshing(true);
        load();
        trySending();
    };

    const seeAll = () => navigation.reset({ index: 1, routes: [{ name: 'FarmerHome' }, { name: 'History', params: { tab: true } }] });
    const openCheck = (item) => navigation.navigate('Result', { diagnosisId: item.diagnosis_id });
    const unread = history.filter((item) => item.officer_response && !seen.has(item.diagnosis_id)).length;

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
                    <Text className="flex-1 text-2xl font-bold" style={{ color: COLORS.brand }}>
                        Sproutly
                    </Text>
                    {/* The bell: officers' replies not opened yet. Push notifications will open the same list. */}
                    <TouchableOpacity
                        onPress={() => navigation.navigate('Notifications')}
                        hitSlop={10}
                        accessibilityRole="button"
                        accessibilityLabel={unread ? `Notifications, ${unread} new` : 'Notifications'}
                        className="p-1.5"
                    >
                        <Ionicons name={unread ? 'notifications' : 'notifications-outline'} size={26} color={COLORS.ink} />
                        {unread > 0 && (
                            <View
                                className="absolute items-center justify-center rounded-full"
                                style={{ top: 0, right: 0, minWidth: 18, height: 18, paddingHorizontal: 4, backgroundColor: COLORS.danger, borderWidth: 2, borderColor: COLORS.background }}
                            >
                                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700' }}>{unread > 9 ? '9+' : unread}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
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
                            Take a photo to find the problem
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.75)" />
                </TouchableOpacity>

                {/* Disease library (g08): the same card shape as the main action, but quieter. */}
                <TouchableOpacity
                    onPress={() => navigation.navigate('Library')}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    className="mt-3 rounded-2xl px-5 py-4 flex-row items-center"
                    style={{ backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.divider }}
                >
                    <Ionicons name="book-outline" size={24} color={COLORS.brand} />
                    <View className="flex-1 ml-4">
                        <Text className="text-base font-bold" style={{ color: COLORS.ink }}>Disease library</Text>
                        <Text className="text-sm mt-0.5" style={{ color: COLORS.muted }}>
                            Causes, spread and what to do
                        </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color={COLORS.faint} />
                </TouchableOpacity>

                {/* Checks saved with no signal (g07) */}
                <QueueCard items={queue} busy={sendingQueue} onTryNow={trySending} onRemove={removeFromQueue} />

                {/* Recent checks */}
                <View className="flex-row items-center justify-between mt-10 mb-1">
                    <Text className="text-lg font-bold" style={{ color: COLORS.ink }}>
                        Recent checks
                    </Text>
                    {/* No count: the list loads the newest 50 and hides retaken checks, so a number could be wrong. */}
                    {history.length > LATEST && (
                        <TouchableOpacity onPress={seeAll} hitSlop={8} accessibilityRole="button">
                            <Text className="text-base font-semibold" style={{ color: COLORS.brand }}>
                                See all
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
                {history.savedCopy && <SavedCopyNote what="your checks" />}

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
                            onPress={() => openCheck(item)}
                        />
                    ))
                )}
            </ScrollView>
            <BottomBar navigation={navigation} active="FarmerHome" />
        </SafeAreaView>
    );
}
