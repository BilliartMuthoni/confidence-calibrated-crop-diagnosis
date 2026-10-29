import React, { useState, useContext } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthContext } from '../../context/AuthContext';
import { changeContact } from '../../api/AuthService';
import { signInWith } from '../../api/oauth';
import { accountOf } from '../../api/tokens';
import { toFriendlyError } from '../../utils/errorMessages';
import ErrorBanner from '../../components/ErrorBanner';
import ScreenHeader from '../../components/ScreenHeader';
import CodeInput from '../../components/CodeInput';
import BusyOverlay from '../../components/BusyOverlay';
import { PrimaryButton } from '../../components/Buttons';
import { showDialog } from '../../components/Dialog';
import { Field } from './ChangePasswordScreen';
import { COLORS } from '../../constants/theme';
import useKeyboardScroll from '../../utils/useKeyboardScroll';

/**
 * Change the phone number or email used to log in. They are the account's sign-in name, so the
 * same proof as deleting the account comes first: password and authenticator code, or for an
 * account made with Google, continuing with Google again. An email that came from Google stays.
 * The new number or email is not yet confirmed with a code (that comes with email and SMS
 * verification); other phones are signed out, as with a password change.
 */
export default function EditContactScreen({ route, navigation }) {
    const scrollRef = useKeyboardScroll();
    const { phone: oldPhone, email: oldEmail, googleConnected, hasPassword } = route.params;
    const { userToken, userRoles, login } = useContext(AuthContext);
    const [phone, setPhone] = useState(oldPhone || '');
    const [email, setEmail] = useState(oldEmail || '');
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const changed = phone.trim() !== (oldPhone || '') || email.trim() !== (oldEmail || '');

    const saved = async (tokens) => {
        await login(tokens.access_token, userRoles, tokens.refresh_token);
        showDialog('Saved', 'Log in with your new details next time. Any other phone signed in to your account has been signed out.');
        navigation.navigate('Account', { refresh: Date.now() });
    };

    const saveWithPassword = async () => {
        setLoading(true);
        setError(null);
        try {
            await saved(await changeContact({ token: userToken, phoneNumber: phone.trim(), email: email.trim(), password, code }));
        } catch (e) {
            setError(toFriendlyError(e));
            setCode('');
        } finally {
            setLoading(false);
        }
    };

    const saveWithGoogle = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await signInWith('google');
            if (!result) return; // closed or cancelled: nothing happens
            const tokens = result.tokens;
            if (!tokens || accountOf(tokens.access_token) !== accountOf(userToken)) {
                setError({ title: 'Different Google account', message: 'Continue with the Google account you use for Sproutly.', retryable: false });
                return;
            }
            await login(tokens.access_token, userRoles, tokens.refresh_token); // keep this sign-in if saving fails
            await saved(await changeContact({ token: tokens.access_token, phoneNumber: phone.trim(), email: email.trim() }));
        } catch (e) {
            setError(toFriendlyError(e));
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <BusyOverlay visible={loading} message="Saving your details" />
            <ScreenHeader title="Phone and email" onBack={() => navigation.goBack()} />
            <KeyboardAvoidingView behavior="padding" className="flex-1">
                <ScrollView ref={scrollRef} contentContainerClassName="px-5 pb-10" keyboardShouldPersistTaps="handled">
                    <Text className="text-sm leading-5 mb-5" style={{ color: COLORS.muted }}>
                        You log in with these. Keep at least one.
                    </Text>

                    <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad"
                           placeholder="0712345678" autoComplete="tel" />
                    {googleConnected ? (
                        <View className="mb-4">
                            <Text className="text-sm font-semibold mb-2" style={{ color: COLORS.ink }}>
                                Email
                            </Text>
                            <Text className="text-base" style={{ color: COLORS.text }}>
                                {oldEmail}
                            </Text>
                            <Text className="text-xs mt-1 leading-4" style={{ color: COLORS.muted }}>
                                This email comes from Google. To change it, disconnect Google first.
                            </Text>
                        </View>
                    ) : (
                        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address"
                               autoCapitalize="none" autoCorrect={false} placeholder="you@example.com" autoComplete="email" />
                    )}

                    <View className="mt-2 pt-5" style={{ borderTopWidth: 1, borderTopColor: COLORS.divider }}>
                        <Text className="text-base font-bold mb-1" style={{ color: COLORS.ink }}>
                            Confirm it's you
                        </Text>
                        {hasPassword ? (
                            <>
                                <Text className="text-sm leading-5 mb-4" style={{ color: COLORS.muted }}>
                                    So nobody else can move your account to their number or email.
                                </Text>
                                <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} />
                                <Text className="text-sm font-semibold mb-2" style={{ color: COLORS.ink }}>
                                    Code from your authenticator app
                                </Text>
                                <CodeInput value={code} onChangeText={setCode} tone="light" autoFocus={false} />
                            </>
                        ) : (
                            <Text className="text-sm leading-5" style={{ color: COLORS.muted }}>
                                You'll continue with Google again before the change is saved.
                            </Text>
                        )}
                    </View>

                    {error && (
                        <View className="mt-4">
                            <ErrorBanner error={error} onDismiss={() => setError(null)} />
                        </View>
                    )}
                    <View className="mt-6">
                        {hasPassword ? (
                            <PrimaryButton label="Save" onPress={saveWithPassword} loading={loading}
                                           disabled={!changed || !password || code.length !== 6} />
                        ) : (
                            <PrimaryButton label="Continue with Google and save" icon="logo-google" onPress={saveWithGoogle}
                                           loading={loading} disabled={!changed} />
                        )}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
