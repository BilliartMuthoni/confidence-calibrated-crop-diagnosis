import React, { useState, useEffect, useContext, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { deleteSavedQuestions, fetchCurrentUser, setKeepQuestions, setMyCounty } from '../../api/AuthService';
import { toFriendlyError } from '../../utils/errorMessages';
import { loadCounty, saveCounty } from '../../utils/farmerCounty';
import ErrorBanner from '../../components/ErrorBanner';
import ScreenHeader from '../../components/ScreenHeader';
import CountyPicker from '../../components/CountyPicker';
import BottomBar from '../../components/BottomBar';
import { Group, NavRow, SwitchRow } from '../../components/SettingsRows';
import { showPhone } from '../../utils/phone';
import { COLORS } from '../../constants/theme';
import { APP_VERSION } from '../../constants/accountText';
import BusyOverlay from '../../components/BusyOverlay';
import { showDialog } from '../../components/Dialog';
import { queuedCount } from '../../utils/offlineQueue';

/**
 * The Account tab: the farmer's profile and settings, grouped like other apps' account pages
 * (profile, county, security, privacy, help and about). Kept short: the sign-in settings are on
 * their own screen (Password and sign-in), and Support is the bottom bar's tab. Phone and email
 * open EditContact, which asks for proof first (they are the account's sign-in name).
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

    const [privacyError, setPrivacyError] = useState(null);
    const [savingKeep, setSavingKeep] = useState(false);

    const changeKeep = async (value) => {
        setSavingKeep(true);
        setPrivacyError(null);
        try {
            setProfile(await setKeepQuestions({ token: userToken, keep: value }));
        } catch (e) {
            setPrivacyError(toFriendlyError(e));
        } finally {
            setSavingKeep(false);
        }
    };

    const confirmDeleteQuestions = () => {
        showDialog(
            'Delete your saved questions?',
            'The questions you asked about your results, and the replies, are deleted from every check. Your checks stay.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        setPrivacyError(null);
                        try {
                            await deleteSavedQuestions({ token: userToken });
                            showDialog('Deleted', 'Your saved questions have been deleted.');
                        } catch (e) {
                            setPrivacyError(toFriendlyError(e));
                        }
                    },
                },
            ]
        );
    };

    const confirmLogout = async () => {
        const back = profile?.has_password
            ? 'You will need your password and a code from your authenticator app to get back in.'
            : 'You will need to continue with Google to get back in.';
        // Photos saved with no signal (g07) are deleted on log out: say so first.
        const waiting = await queuedCount();
        const lost = waiting
            ? ` ${waiting === 1 ? '1 check waiting to send' : `${waiting} checks waiting to send`} will be deleted.`
            : '';
        showDialog('Log out?', back + lost, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Log out', style: 'destructive', onPress: logout },
        ]);
    };

    const go = (name, params) => () => navigation.navigate(name, params);
    const editContact = profile && {
        phone: showPhone(profile.user_phone_number),
        email: profile.user_email,
        googleConnected: profile.google_connected,
        hasPassword: profile.has_password,
    };
    const joined = profile?.created_at
        ? new Date(profile.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
        : '—';
    // The number as farmers write it (0712 345 678), not as stored (+254...).
    const identifier = showPhone(profile?.user_phone_number) || profile?.user_email || '—';
    // An email's first letter; a phone account gets a person icon (a digit means nothing).
    const initial = !profile?.user_phone_number && profile?.user_email ? profile.user_email.charAt(0).toUpperCase() : null;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={['top']}>
            <StatusBar style="dark" />
            <BusyOverlay visible={savingKeep} message="Saving your choice" />
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
                                {initial ? (
                                    <Text className="text-white text-2xl font-bold">{initial}</Text>
                                ) : (
                                    <Ionicons name="person" size={28} color="#FFFFFF" />
                                )}
                            </View>
                            <View className="flex-1 ml-4">
                                <Text className="text-lg font-bold" style={{ color: COLORS.ink }}>
                                    {identifier}
                                </Text>
                                <Text className="text-sm mt-0.5" style={{ color: COLORS.muted }}>
                                    Farmer · joined {joined}
                                </Text>
                            </View>
                        </View>

                        {/* The number is in the header; one row opens the change screen (proof first). */}
                        <Group title="Profile">
                            <NavRow icon="person-outline" label="Phone and email" hint="Change how you log in"
                                    onPress={go('EditContact', editContact)} last />
                        </Group>

                        {/* County: routes referrals to that county's officers and picks the support contacts */}
                        <Group title="Your county" note="Shared cases and support contacts use this county.">
                            <CountyPicker asRow value={county} onChange={changeCounty} />
                        </Group>
                        {countyError && (
                            <View className="px-5 mt-3">
                                <ErrorBanner error={countyError} onDismiss={() => setCountyError(null)} />
                            </View>
                        )}

                        {/* Change password, authenticator, backup codes and Google, on their own screen. */}
                        <Group title="Security">
                            <NavRow icon="lock-closed-outline" label="Password and sign-in"
                                    hint="Password, authenticator, backup codes, Google" onPress={go('SignInSecurity')} last />
                        </Group>

                        <Group title="Privacy">
                            <SwitchRow icon="chatbubbles-outline" label="Keep my assistant questions"
                                       hint="Read them again in Your checks. Only you see them."
                                       value={profile.keep_questions === true} onChange={changeKeep} disabled={savingKeep} />
                            <NavRow icon="trash-outline" label="Delete my saved questions" hint="Your checks stay"
                                    onPress={confirmDeleteQuestions} last />
                        </Group>
                        {privacyError && (
                            <View className="px-5 mt-3">
                                <ErrorBanner error={privacyError} onDismiss={() => setPrivacyError(null)} />
                            </View>
                        )}

                        {/* Support contacts are the bottom bar's Support tab, so they are not repeated here. */}
                        <Group title="Help and about">
                            <NavRow icon="help-circle-outline" label="Help" onPress={go('Info', { page: 'help' })} />
                            <NavRow icon="book-outline" label="Disease library" onPress={go('Library')} />
                            <NavRow icon="shield-checkmark-outline" label="Privacy policy" onPress={go('Info', { page: 'privacy' })} />
                            <NavRow icon="document-text-outline" label="Terms of use" onPress={go('Info', { page: 'terms' })} />
                            <NavRow icon="information-circle-outline" label="About Sproutly" hint={`Version ${APP_VERSION}`}
                                    onPress={go('Info', { page: 'about' })} last />
                        </Group>

                        {/* Log out, then the one action that can't be undone, apart from everything else. */}
                        <Group>
                            <NavRow icon="log-out-outline" label="Log out" color={COLORS.danger} onPress={confirmLogout} />
                            <NavRow icon="trash-outline" label="Delete my account" hint="Your photos, checks and account"
                                    color={COLORS.danger} onPress={go('DeleteAccount', { googleOnly: !profile.has_password })} last />
                        </Group>
                    </>
                )}
            </ScrollView>
            <BottomBar navigation={navigation} active="Account" />
        </SafeAreaView>
    );
}
