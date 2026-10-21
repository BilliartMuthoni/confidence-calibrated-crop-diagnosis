import React, { useState, useEffect, useContext, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthContext } from '../../context/AuthContext';
import { fetchCurrentUser, setMyCounty } from '../../api/AuthService';
import { toFriendlyError } from '../../utils/errorMessages';
import { loadCounty, saveCounty } from '../../utils/farmerCounty';
import ErrorBanner from '../../components/ErrorBanner';
import ScreenHeader from '../../components/ScreenHeader';
import CountyPicker from '../../components/CountyPicker';
import BottomBar from '../../components/BottomBar';
import { Group, InfoRow, NavRow } from '../../components/SettingsRows';
import { COLORS } from '../../constants/theme';
import { APP_VERSION } from '../../constants/accountText';

/**
 * The Account tab: the farmer's profile and every setting, grouped like the account pages of
 * other professional apps (profile, security, privacy, help, about). Phone and email are
 * read-only for now: changing them safely needs re-verification.
 */
export default function AccountScreen({ route, navigation }) {
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

    // Loads again when a settings screen sends the farmer back with { refresh } (e.g. Google connected).
    useEffect(() => {
        load();
    }, [load, route.params?.refresh]);

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
        const back = profile?.has_password
            ? 'You will need your password and a code from your authenticator app to get back in.'
            : 'You will need to continue with Google to get back in.';
        Alert.alert('Log out?', back, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: logout },
        ]);
    };

    const go = (name, params) => () => navigation.navigate(name, params);
    const memberSince = profile?.created_at
        ? new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
        : '—';
    const identifier = profile?.user_phone_number || profile?.user_email || '—';
    const initial = (identifier || '?').replace(/^\+?/, '').charAt(0).toUpperCase();
    const secured = profile?.has_password && profile?.mfa_enabled;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top']}>
            <StatusBar style="dark" />
            <ScreenHeader title="Account" />
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
                        {/* Who is signed in */}
                        <View className="flex-row items-center px-5 mt-2">
                            <View className="w-14 h-14 rounded-full items-center justify-center" style={{ backgroundColor: COLORS.brand }}>
                                <Text className="text-white text-2xl font-bold">{initial}</Text>
                            </View>
                            <View className="flex-1 ml-4">
                                <Text className="text-lg font-bold" style={{ color: COLORS.ink }}>
                                    {identifier}
                                </Text>
                                <Text className="text-sm mt-0.5" style={{ color: COLORS.muted }}>
                                    Farmer · member since {memberSince}
                                </Text>
                            </View>
                        </View>

                        <Group title="Profile">
                            <InfoRow label="Phone" value={profile.user_phone_number || 'Not set'} />
                            <InfoRow label="Email" value={profile.user_email || 'Not set'} last />
                        </Group>

                        {/* County: routes referrals to that county's officers and picks the support contacts */}
                        <View className="px-5 mt-5">
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

                        <Group
                            title="Security"
                            note="Lost your phone? Sign in on another phone: only your newest sign-in stays active, so the lost phone is signed out."
                        >
                            {profile.has_password && (
                                <NavRow icon="key-outline" label="Change password" hint="Signs out your other phones"
                                        onPress={go('ChangePassword')} />
                            )}
                            {secured && (
                                <>
                                    <NavRow icon="phone-portrait-outline" label="Authenticator on a new phone"
                                            onPress={go('NewAuthenticator')} />
                                    <NavRow icon="document-lock-outline" label="Make new backup codes"
                                            hint="For signing in without your phone" onPress={go('BackupCodes')} />
                                </>
                            )}
                            {!profile.google_connected ? (
                                <NavRow icon="logo-google" label="Connect Google" hint="Log in with Google next time"
                                        onPress={go('ConnectGoogle')} last />
                            ) : profile.has_password ? (
                                <NavRow icon="logo-google" label="Google: connected" hint="Tap to disconnect"
                                        onPress={go('ConnectGoogle', { disconnect: true })} last />
                            ) : (
                                // Made with Google: it's the only way in, so it can't be disconnected.
                                <InfoRow label="Google" value="Connected" last />
                            )}
                        </Group>

                        <Group title="Privacy">
                            <NavRow icon="shield-checkmark-outline" label="Privacy policy" hint="What Sproutly keeps and who sees it"
                                    onPress={go('Info', { page: 'privacy' })} />
                            <NavRow icon="document-text-outline" label="Terms of use" onPress={go('Info', { page: 'terms' })} />
                            <NavRow icon="trash-outline" label="Delete my account" hint="Your photos, checks and account"
                                    color={COLORS.disease} onPress={go('DeleteAccount', { googleOnly: !profile.has_password })} last />
                        </Group>

                        <Group title="Help">
                            <NavRow icon="help-circle-outline" label="Help and common questions" onPress={go('Info', { page: 'help' })} />
                            <NavRow icon="call-outline" label="Contact support" hint="Your county's agricultural contacts"
                                    onPress={() => navigation.reset({ index: 1, routes: [{ name: 'FarmerHome' }, { name: 'SupportContacts', params: { tab: true } }] })}
                                    last />
                        </Group>

                        <Group title="About">
                            <NavRow icon="information-circle-outline" label="About Sproutly" hint={`Version ${APP_VERSION}`}
                                    onPress={go('Info', { page: 'about' })} last />
                        </Group>

                        <Group>
                            <NavRow icon="log-out-outline" label="Log out" color={COLORS.disease} onPress={confirmLogout} last />
                        </Group>
                    </>
                )}
            </ScrollView>
            <BottomBar navigation={navigation} active="Account" />
        </SafeAreaView>
    );
}
