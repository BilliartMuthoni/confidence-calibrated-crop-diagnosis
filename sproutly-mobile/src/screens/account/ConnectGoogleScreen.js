import React, { useState, useContext } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthContext } from '../../context/AuthContext';
import { disconnect } from '../../api/AuthService';
import { connectWith } from '../../api/oauth';
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

/**
 * Connect Google to this account, or disconnect it. Like GitHub's connected accounts: the
 * password and authenticator code first, then (to connect) Google's page, where any Google
 * account can be picked, even one with a different email.
 */
export default function ConnectGoogleScreen({ route, navigation }) {
    const scrollRef = useKeyboardScroll();
    const disconnecting = Boolean(route.params?.disconnect);
    const { userToken } = useContext(AuthContext);
    const [password, setPassword] = useState('');
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const done = (title, message) => {
        showDialog(title, message);
        // Back to Account, which loads the account again to show the change.
        navigation.navigate('Account', { refresh: Date.now() });
    };

    const submit = async () => {
        setLoading(true);
        setError(null);
        try {
            if (disconnecting) {
                await disconnect({ token: userToken, provider: 'google', password, code });
                done('Google disconnected', 'Log in with your password and authenticator code from now on.');
                return;
            }
            const joined = await connectWith('google', { token: userToken, password, code });
            if (!joined) {
                setCode(''); // cancelled on Google's page; the code was used, so ask for a new one
                setLoading(false);
                return;
            }
            done('Google connected', 'Next time you can tap Continue with Google, then enter your authenticator code.');
        } catch (e) {
            setError(toFriendlyError(e));
            setCode('');
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <BusyOverlay visible={loading} message="Connecting Google" />
            <ScreenHeader title={disconnecting ? 'Disconnect Google' : 'Connect Google'} onBack={() => navigation.goBack()} />
            <KeyboardAvoidingView behavior="padding" className="flex-1">
                <ScrollView ref={scrollRef} contentContainerClassName="px-5 pb-10" keyboardShouldPersistTaps="handled">
                    <Text className="text-base leading-6 mb-5" style={{ color: COLORS.text }}>
                        {disconnecting
                            ? 'You will no longer be able to continue with Google. Your account, photos and checks stay.'
                            : 'Then you can log in with Continue with Google instead of typing your password. You can pick any Google account, even one with a different email.'}
                    </Text>
                    <Text className="text-sm leading-5 mb-5" style={{ color: COLORS.muted }}>
                        For your safety, confirm it's you first.
                    </Text>

                    <Field label="Password" secureTextEntry value={password} onChangeText={setPassword} />
                    <Text className="text-sm font-semibold mb-2" style={{ color: COLORS.ink }}>
                        Code from your authenticator app
                    </Text>
                    <CodeInput value={code} onChangeText={setCode} tone="light" autoFocus={false} />

                    {error && (
                        <View className="mt-4">
                            <ErrorBanner error={error} onDismiss={() => setError(null)} />
                        </View>
                    )}
                    <View className="mt-6">
                        <PrimaryButton
                            label={disconnecting ? 'Disconnect Google' : 'Continue with Google'}
                            icon={disconnecting ? 'unlink-outline' : 'logo-google'}
                            color={disconnecting ? COLORS.danger : undefined}
                            onPress={submit}
                            loading={loading}
                            disabled={!password || code.length !== 6}
                        />
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
