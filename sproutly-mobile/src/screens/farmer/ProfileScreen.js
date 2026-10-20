import React, { useState, useEffect, useContext, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { fetchCurrentUser, setMyCounty } from '../../api/AuthService';
import { toFriendlyError } from '../../utils/errorMessages';
import { loadCounty, saveCounty } from '../../utils/farmerCounty';
import ErrorBanner from '../../components/ErrorBanner';
import ScreenHeader from '../../components/ScreenHeader';
import CountyPicker from '../../components/CountyPicker';
import { COLORS } from '../../constants/theme';

const ROLE_LABELS = {
    farmer: 'Farmer',
    officer: 'Extension officer',
    admin: 'Administrator',
};

const groupStyle = { backgroundColor: COLORS.surface, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.divider };

function Row({ label, value, last }) {
    return (
        <View className="flex-row items-center py-4 ml-5 pr-5" style={last ? null : { borderBottomWidth: 1, borderBottomColor: COLORS.divider }}>
            <Text className="text-base flex-1" style={{ color: COLORS.muted }}>
                {label}
            </Text>
            <Text className="text-base font-semibold" style={{ color: COLORS.ink }}>
                {value}
            </Text>
        </View>
    );
}

export default function ProfileScreen({ navigation }) {
    const { userToken, logout } = useContext(AuthContext);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [county, setCounty] = useState(null);
    const [countyError, setCountyError] = useState(null);

    const load = useCallback(async () => {
        // At logout userToken becomes null while this screen is still mounted; don't ask the backend.
        if (!userToken) return;
        setLoading(true);
        setError(null);
        try {
            const data = await fetchCurrentUser({ token: userToken });
            setProfile(data);
            // The backend's county wins; the phone's copy fills in until one is saved there.
            const local = await loadCounty();
            setCounty(data.county || local);
            if (data.county && data.county !== local) saveCounty(data.county);
        } catch (e) {
            setError(toFriendlyError(e));
        } finally {
            setLoading(false);
        }
    }, [userToken]);

    useEffect(() => {
        load();
    }, [load]);

    const changeCounty = async (value) => {
        const before = county;
        setCounty(value);
        setCountyError(null);
        try {
            await setMyCounty({ token: userToken, county: value });
            saveCounty(value);
        } catch (e) {
            setCounty(before);
            setCountyError(toFriendlyError(e));
        }
    };

    const confirmLogout = () => {
        Alert.alert('Log out?', 'You will need your password and a code from your authenticator app to get back in.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: logout },
        ]);
    };

    const memberSince = profile?.created_at
        ? new Date(profile.created_at).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'long',
          })
        : '—';

    const identifier = profile?.user_phone_number || profile?.user_email || '—';
    const initial = (identifier || '?').replace(/^\+?/, '').charAt(0).toUpperCase();

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title="Profile" onBack={() => navigation.goBack()} />
            <ScrollView contentContainerClassName="pb-10">
                {loading ? (
                    <View className="items-center py-16">
                        <ActivityIndicator color={COLORS.brand} />
                    </View>
                ) : error ? (
                    <View className="px-5 mt-4">
                        <ErrorBanner error={error} onRetry={load} />
                    </View>
                ) : (
                    <>
                        {/* Identity */}
                        <View className="flex-row items-center px-5 mt-2">
                            <View
                                className="w-14 h-14 rounded-full items-center justify-center"
                                style={{ backgroundColor: COLORS.brand }}
                            >
                                <Text className="text-white text-2xl font-bold">{initial}</Text>
                            </View>
                            <View className="flex-1 ml-4">
                                <Text className="text-lg font-bold" style={{ color: COLORS.ink }}>
                                    {identifier}
                                </Text>
                                <Text className="text-sm mt-0.5" style={{ color: COLORS.muted }}>
                                    {ROLE_LABELS[profile.role] || profile.role}
                                    {profile.is_verified ? ' · Verified' : ''}
                                </Text>
                            </View>
                        </View>

                        {/* Account details */}
                        <View className="mt-6" style={groupStyle}>
                            <Row label="Phone" value={profile.user_phone_number || 'Not set'} />
                            <Row label="Email" value={profile.user_email || 'Not set'} />
                            <Row label="Member since" value={memberSince} last />
                        </View>

                        {/* County: routes referrals to that county's officers and picks the support contacts */}
                        {profile.role === 'farmer' && (
                            <View className="px-5 mt-8">
                                <Text className="text-base font-bold" style={{ color: COLORS.ink }}>
                                    Your county
                                </Text>
                                <Text className="text-sm mt-0.5 mb-3 leading-5" style={{ color: COLORS.muted }}>
                                    Cases you share go to extension officers here, and Support shows this county's contacts.
                                </Text>
                                <CountyPicker value={county} onChange={changeCounty} />
                                {countyError && (
                                    <View className="mt-3">
                                        <ErrorBanner error={countyError} onDismiss={() => setCountyError(null)} />
                                    </View>
                                )}
                            </View>
                        )}

                        {/* What this app covers -- honest scope */}
                        <View className="px-5 mt-8">
                            <Text className="text-base font-bold" style={{ color: COLORS.ink }}>
                                What Sproutly can check
                            </Text>
                            <Text className="text-base mt-1 leading-6" style={{ color: COLORS.muted }}>
                                Diseases of maize, tomato and potato. Anything else, including pests and soil problems,
                                needs local support such as your county agriculture office or an agrovet.
                            </Text>
                        </View>

                        <TouchableOpacity
                            onPress={confirmLogout}
                            accessibilityRole="button"
                            className="mt-8 flex-row items-center px-5 py-4"
                            style={groupStyle}
                        >
                            <Ionicons name="log-out-outline" size={20} color={COLORS.disease} />
                            <Text className="text-base font-semibold ml-3" style={{ color: COLORS.disease }}>
                                Log out
                            </Text>
                        </TouchableOpacity>

                        <Text className="text-center text-xs mt-6" style={{ color: COLORS.faint }}>
                            Sproutly · version 1.0.0
                        </Text>
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
