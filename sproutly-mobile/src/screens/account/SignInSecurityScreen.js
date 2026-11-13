import React, { useCallback, useContext, useEffect, useState } from 'react';
import { View, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthContext } from '../../context/AuthContext';
import { fetchCurrentUser } from '../../api/AuthService';
import { toFriendlyError } from '../../utils/errorMessages';
import ErrorBanner from '../../components/ErrorBanner';
import ScreenHeader from '../../components/ScreenHeader';
import { Group, InfoRow, NavRow } from '../../components/SettingsRows';
import { COLORS } from '../../constants/theme';

/**
 * Account > Password and sign-in: the security settings, one tap away so the Account page stays
 * short (the layout of other apps' account pages). Loads the profile again whenever it is shown,
 * so it is current after changing the password or connecting Google.
 */
export default function SignInSecurityScreen({ navigation }) {
    const { userToken } = useContext(AuthContext);
    const [profile, setProfile] = useState(null);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        if (!userToken) return;
        setError(null);
        try {
            setProfile(await fetchCurrentUser({ token: userToken }));
        } catch (e) {
            setError(toFriendlyError(e));
        }
    }, [userToken]);

    useEffect(() => navigation.addListener('focus', load), [navigation, load]);

    const go = (name, params) => () => navigation.navigate(name, params);
    const secured = profile?.has_password && profile?.mfa_enabled;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title="Password and sign-in" onBack={() => navigation.goBack()} />
            <ScrollView contentContainerClassName="pb-10">
                {error ? (
                    <View className="px-5 mt-4">
                        <ErrorBanner error={error} onRetry={load} />
                    </View>
                ) : !profile ? (
                    <View className="items-center py-16">
                        <ActivityIndicator color={COLORS.brand} />
                    </View>
                ) : (
                    <Group note="Lost your phone? Sign in on another phone: only your newest sign-in stays active, so the lost phone is signed out.">
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
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
