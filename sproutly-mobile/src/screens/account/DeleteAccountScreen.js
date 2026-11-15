import React, { useState, useContext } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthContext } from '../../context/AuthContext';
import { deleteAccount } from '../../api/AuthService';
import { signInWith } from '../../api/oauth';
import { accountOf, clearTokens } from '../../api/tokens';
import { toFriendlyError } from '../../utils/errorMessages';
import ErrorBanner from '../../components/ErrorBanner';
import ScreenHeader from '../../components/ScreenHeader';
import CodeInput from '../../components/CodeInput';
import { PrimaryButton } from '../../components/Buttons';
import { Field } from './ChangePasswordScreen';
import { COLORS } from '../../constants/theme';
import BusyOverlay from '../../components/BusyOverlay';
import { showDialog } from '../../components/Dialog';
import useKeyboardScroll from '../../utils/useKeyboardScroll';

const WHAT_GOES = [
    'Your account, phone number or email, and county',
    'All your leaf photos and checks, including officers\' replies',
    'Cases you sent to extension officers',
    'Your backup codes',
];

/**
 * Delete the account and everything in it. Proof first: the password and authenticator code,
 * or for an account made with Google, continuing with Google again (the backend accepts only a
 * Google sign-in from the last 5 minutes). Grace period (t71): the farmer is signed out at once
 * and everything is deleted 14 days later; logging in before then keeps the account.
 */
export default function DeleteAccountScreen({ route, navigation }) {
    const scrollRef = useKeyboardScroll();
    const googleOnly = Boolean(route.params?.googleOnly);
    const { userToken, userRoles, login, logout } = useContext(AuthContext);
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const finished = async (scheduled) => {
        // The session no longer exists on the server: just forget the keys on this phone.
        await clearTokens();
        const when = scheduled?.delete_after
            ? new Date(`${scheduled.delete_after}Z`.replace(/Z+$/, 'Z')).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
              })
            : null;
        showDialog(
            'Your account will be deleted',
            `Everything will be deleted${when ? ` on ${when}` : ' in 14 days'}. Changed your mind? Log in before then to keep your account.`
        );
        await logout();
    };

    const deleteWithPassword = async () => {
        setLoading(true);
        setError(null);
        try {
            await finished(await deleteAccount({ token: userToken, password, code }));
        } catch (e) {
            setError(toFriendlyError(e));
            setCode('');
            setLoading(false);
        }
    };

    const deleteWithGoogle = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await signInWith('google');
            if (!result) {
                setLoading(false);
                return; // closed or cancelled: nothing happens
            }
            const tokens = result.tokens;
            if (!tokens || accountOf(tokens.access_token) !== accountOf(userToken)) {
                setError({ title: 'Different Google account', message: 'Continue with the Google account you use for Sproutly.', retryable: false });
                setLoading(false);
                return;
            }
            await login(tokens.access_token, userRoles, tokens.refresh_token); // keep this sign-in if deleting fails
            await finished(await deleteAccount({ token: tokens.access_token }));
        } catch (e) {
            setError(toFriendlyError(e));
            setLoading(false);
        }
    };

    const confirmThen = (action) => () =>
        showDialog('Delete your account?', 'You will be logged out now, and everything listed is deleted for good after 14 days. You can log in before then and choose to keep it.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: action },
        ]);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <BusyOverlay visible={loading} message="Deleting your account" />
            <ScreenHeader title="Delete my account" onBack={() => navigation.goBack()} />
            <KeyboardAvoidingView behavior="padding" className="flex-1">
                <ScrollView ref={scrollRef} contentContainerClassName="px-5 pb-10" keyboardShouldPersistTaps="handled">
                    <Text className="text-base font-bold mb-2" style={{ color: COLORS.ink }}>
                        After 14 days, this deletes for good:
                    </Text>
                    {WHAT_GOES.map((line) => (
                        <Text key={line} className="text-base leading-6 mb-1" style={{ color: COLORS.text }}>
                            •  {line}
                        </Text>
                    ))}
                    <Text className="text-sm leading-5 mt-3 mb-6" style={{ color: COLORS.muted }}>
                        You are logged out now and officers stop seeing your cases. Changed your mind? Log in within 14
                        days to keep your account. Only a note that an account was deleted, and when, is kept, with
                        nothing that identifies you.
                    </Text>

                    {googleOnly ? (
                        <Text className="text-base leading-6 mb-5" style={{ color: COLORS.muted }}>
                            To confirm it's you, continue with Google again.
                        </Text>
                    ) : (
                        <>
                            <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} />
                            <Text className="text-sm font-semibold mb-2" style={{ color: COLORS.ink }}>
                                Code from your authenticator app
                            </Text>
                            <CodeInput value={code} onChangeText={setCode} tone="light" autoFocus={false} />
                        </>
                    )}

                    {error && (
                        <View className="mt-4">
                            <ErrorBanner error={error} onDismiss={() => setError(null)} />
                        </View>
                    )}
                    <View className="mt-6">
                        {googleOnly ? (
                            <PrimaryButton label="Continue with Google and delete" icon="logo-google" color={COLORS.danger}
                                           onPress={confirmThen(deleteWithGoogle)} loading={loading} />
                        ) : (
                            <PrimaryButton label="Delete my account" icon="trash-outline" color={COLORS.danger}
                                           onPress={confirmThen(deleteWithPassword)} loading={loading}
                                           disabled={!password || code.length !== 6} />
                        )}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
