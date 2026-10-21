import React, { useState, useContext } from 'react';
import { View, Text, ScrollView, Image, Linking, TouchableOpacity, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Clipboard from 'expo-clipboard';
import { AuthContext } from '../../context/AuthContext';
import { startNewAuthenticator, confirmNewAuthenticator } from '../../api/AuthService';
import { toFriendlyError } from '../../utils/errorMessages';
import ErrorBanner from '../../components/ErrorBanner';
import ScreenHeader from '../../components/ScreenHeader';
import CodeInput from '../../components/CodeInput';
import { PrimaryButton } from '../../components/Buttons';
import { COLORS } from '../../constants/theme';

/**
 * Move the authenticator to a new phone. Step 1: a code from the app that works now (proves
 * it's you). Step 2: add the new key to the authenticator on the new phone and enter its code.
 * The old app keeps working until step 2 succeeds, so a mistake can't lock the farmer out.
 */
export default function NewAuthenticatorScreen({ navigation }) {
    const { userToken } = useContext(AuthContext);
    const [code, setCode] = useState('');
    const [setup, setSetup] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [showKey, setShowKey] = useState(false);

    const start = async () => {
        setLoading(true);
        setError(null);
        try {
            setSetup(await startNewAuthenticator({ token: userToken, code }));
            setCode('');
        } catch (e) {
            setError(toFriendlyError(e));
            setCode('');
        } finally {
            setLoading(false);
        }
    };

    const confirm = async () => {
        setLoading(true);
        setError(null);
        try {
            await confirmNewAuthenticator({ token: userToken, setupToken: setup.setup_token, code });
            Alert.alert('Authenticator moved', 'From now on, use the codes from the authenticator on your new phone.');
            navigation.goBack();
        } catch (e) {
            setError(toFriendlyError(e));
            setCode('');
        } finally {
            setLoading(false);
        }
    };

    const openApp = () => Linking.openURL(setup.otpauth_uri).catch(() => setShowKey(true));

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title="Authenticator on a new phone" onBack={() => navigation.goBack()} />
            <ScrollView contentContainerClassName="px-5 pb-10" keyboardShouldPersistTaps="handled">
                {!setup ? (
                    <>
                        <Text className="text-base leading-6 mb-5" style={{ color: COLORS.muted }}>
                            First, enter the code your authenticator app shows now. Your current app keeps working until the
                            new one is set up.
                        </Text>
                        <CodeInput value={code} onChangeText={setCode} tone="light" />
                        {error && (
                            <View className="mt-4">
                                <ErrorBanner error={error} onDismiss={() => setError(null)} />
                            </View>
                        )}
                        <View className="mt-6">
                            <PrimaryButton label="Continue" onPress={start} loading={loading} disabled={code.length !== 6} />
                        </View>
                    </>
                ) : (
                    <>
                        <Text className="text-base leading-6 mb-4" style={{ color: COLORS.muted }}>
                            On the new phone, add Sproutly to Google Authenticator or Microsoft Authenticator: scan this code
                            with it, or, if this is the new phone, open the app directly.
                        </Text>
                        <View className="items-center rounded-2xl p-4 mb-4" style={{ backgroundColor: COLORS.surface }}>
                            <Image source={{ uri: setup.qr_code }} style={{ width: 200, height: 200 }} accessibilityLabel="Setup QR code" />
                        </View>
                        <PrimaryButton label="Open authenticator app on this phone" icon="open-outline" onPress={openApp} />
                        <TouchableOpacity onPress={() => setShowKey((v) => !v)} className="py-4 items-center">
                            <Text className="text-base font-semibold" style={{ color: COLORS.brand }}>
                                {showKey ? 'Hide the setup key' : "Can't scan? Show the setup key"}
                            </Text>
                        </TouchableOpacity>
                        {showKey && (
                            <TouchableOpacity onPress={() => Clipboard.setStringAsync(setup.secret)} className="rounded-xl p-4 mb-2"
                                              style={{ backgroundColor: COLORS.surface }}>
                                <Text className="text-lg font-bold text-center" style={{ color: COLORS.ink, letterSpacing: 2 }}>
                                    {setup.secret.match(/.{1,4}/g).join(' ')}
                                </Text>
                                <Text className="text-sm text-center mt-1" style={{ color: COLORS.faint }}>
                                    Tap to copy. Keep it secret.
                                </Text>
                            </TouchableOpacity>
                        )}
                        <Text className="text-base font-bold mt-4 mb-2" style={{ color: COLORS.ink }}>
                            Then enter the code from the new phone
                        </Text>
                        <CodeInput value={code} onChangeText={setCode} tone="light" autoFocus={false} />
                        {error && (
                            <View className="mt-4">
                                <ErrorBanner error={error} onDismiss={() => setError(null)} />
                            </View>
                        )}
                        <View className="mt-6">
                            <PrimaryButton label="Finish" onPress={confirm} loading={loading} disabled={code.length !== 6} />
                        </View>
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
