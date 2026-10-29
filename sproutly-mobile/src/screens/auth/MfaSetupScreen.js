import React, { useState, useContext } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    ActivityIndicator,
    Image,
    Linking,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import * as AuthService from '../../api/AuthService';
import { toFriendlyError } from '../../utils/errorMessages';
import ErrorBanner from '../../components/ErrorBanner';
import CodeInput from '../../components/CodeInput';
import BusyOverlay from '../../components/BusyOverlay';
import useKeyboardScroll from '../../utils/useKeyboardScroll';

function StepTitle({ number, title }) {
    return (
        <View className="flex-row items-center mb-3">
            <View className="w-7 h-7 rounded-full bg-white items-center justify-center">
                <Text className="text-forestDeep font-bold">{number}</Text>
            </View>
            <Text className="text-lg font-bold text-white ml-3">{title}</Text>
        </View>
    );
}

// Shown after sign-up, and at login for an account that has not finished setup.
// The authenticator app is usually on this same phone, so the QR code (which needs
// a second screen) is hidden by default; the app link and the setup key come first.
export default function MfaSetupScreen({ route, navigation }) {
    const scrollRef = useKeyboardScroll();
    const { mfaToken, expiresInMinutes, setup } = route.params;
    const { login } = useContext(AuthContext);
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [copied, setCopied] = useState(false);
    const [showQr, setShowQr] = useState(false);
    // The setup key is a secret: hidden until the farmer needs the manual route.
    const [showManual, setShowManual] = useState(false);

    const groupedKey = setup.secret.match(/.{1,4}/g).join(' ');

    const openAuthenticator = async () => {
        try {
            await Linking.openURL(setup.otpauth_uri);
        } catch {
            setError({
                title: 'No authenticator app found',
                message:
                    "Install Google Authenticator or Microsoft Authenticator from the Play Store, or tap \"Can't open your authenticator?\" to set it up with a key.",
                retryable: false,
            });
        }
    };

    const copyKey = async () => {
        await Clipboard.setStringAsync(setup.secret);
        setCopied(true);
    };

    const submit = async (value = code) => {
        if (value.length !== 6 || loading) return;
        setLoading(true);
        setError(null);
        try {
            const data = await AuthService.confirmMfaSetup({ mfaToken, code: value });
            await login(data.access_token, [data.role], data.refresh_token);
        } catch (e) {
            setError(toFriendlyError(e));
            setCode('');
        } finally {
            setLoading(false);
        }
    };

    return (
        <LinearGradient colors={['#0B1A13', '#1B3D2F', '#2D5A43']} style={{ flex: 1 }}>
            <StatusBar style="light" />
            <BusyOverlay visible={loading} message="Checking your code" />
            <KeyboardAvoidingView behavior="padding" className="flex-1">
                <ScrollView ref={scrollRef} contentContainerClassName="flex-grow pb-10" keyboardShouldPersistTaps="handled">
                    <View className="pt-12 px-5">
                        <TouchableOpacity onPress={() => navigation.goBack()} className="p-2.5 self-start flex-row items-center">
                            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                            <Text className="text-white text-base font-semibold ml-1">Back</Text>
                        </TouchableOpacity>
                    </View>

                    <View className="px-8 pt-4">
                        <Text className="text-2xl font-bold text-white mb-2">Protect your account</Text>
                        <Text className="text-base text-white/70 leading-6 mb-8">
                            Each time you log in, Sproutly will ask for a code from an authenticator app as well as your
                            password. Use Google Authenticator or Microsoft Authenticator from the Play Store.
                        </Text>

                        {/* Step 1: get the secret into the authenticator app */}
                        <StepTitle number="1" title="Add Sproutly to the app" />
                        <TouchableOpacity
                            onPress={openAuthenticator}
                            accessibilityRole="button"
                            className="bg-white py-4 rounded-2xl items-center flex-row justify-center"
                        >
                            <Ionicons name="open-outline" size={18} color="#0B1A13" style={{ marginRight: 8 }} />
                            <Text className="text-forestDeep text-base font-bold">Open authenticator app</Text>
                        </TouchableOpacity>
                        <Text className="text-sm text-white/60 mt-2 text-center">
                            Keep Sproutly open. Come back here for step 2.
                        </Text>

                        {/* The manual routes, folded away: most farmers only need the button above. */}
                        <TouchableOpacity
                            onPress={() => setShowManual((v) => !v)}
                            accessibilityRole="button"
                            accessibilityState={{ expanded: showManual }}
                            className="mt-5 flex-row items-center bg-white/10 border border-white/10 rounded-2xl px-4 py-3.5"
                        >
                            <Ionicons name="key-outline" size={20} color="#FFFFFF" />
                            <View className="flex-1 ml-3">
                                <Text className="text-white text-base font-semibold">Can't open your authenticator?</Text>
                                <Text className="text-white/60 text-sm mt-0.5">Set up manually with a setup key</Text>
                            </View>
                            <Ionicons name={showManual ? 'chevron-down' : 'chevron-forward'} size={18} color="#FFFFFF" />
                        </TouchableOpacity>

                        {showManual && (
                            <View className="mt-3 px-1">
                                <Text className="text-sm text-white/70 mb-2">
                                    In the app, choose "Enter a setup key" and type this key. Keep it private: anyone with it
                                    can make your codes.
                                </Text>
                                <View className="flex-row items-center bg-white/10 border border-white/20 rounded-2xl px-4 py-3">
                                    <Text selectable className="flex-1 text-base font-bold text-white" style={{ letterSpacing: 1 }}>
                                        {groupedKey}
                                    </Text>
                                    <TouchableOpacity onPress={copyKey} hitSlop={10} accessibilityRole="button" className="ml-3 flex-row items-center">
                                        <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={18} color="#FFFFFF" />
                                        <Text className="text-white text-sm font-semibold ml-1">{copied ? 'Copied' : 'Copy'}</Text>
                                    </TouchableOpacity>
                                </View>
                                <Text className="text-xs text-white/50 mt-2">Choose "Time based" if the app asks for the type of key.</Text>

                                <TouchableOpacity onPress={() => setShowQr((v) => !v)} className="mt-3 py-2 flex-row items-center">
                                    <Ionicons name="qr-code-outline" size={18} color="#FFFFFF" />
                                    <Text className="text-white text-sm font-semibold ml-2 underline">
                                        {showQr ? 'Hide QR code' : 'Authenticator on another phone? Show QR code'}
                                    </Text>
                                </TouchableOpacity>
                                {showQr && (
                                    <View className="items-center mt-3">
                                        <View className="bg-white p-3 rounded-2xl">
                                            <Image source={{ uri: setup.qr_code }} style={{ width: 200, height: 200 }} />
                                        </View>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* Step 2: prove it worked */}
                        <View className="mt-10">
                            <StepTitle number="2" title="Enter the code it shows" />
                            <CodeInput value={code} onChangeText={setCode} onComplete={submit} autoFocus={false} />
                        </View>

                        {error && (
                            <View className="mt-4">
                                <ErrorBanner error={error} tone="dark" onDismiss={() => setError(null)} />
                            </View>
                        )}

                        <TouchableOpacity
                            className={`bg-white py-[18px] rounded-2xl items-center mt-6 shadow-lg ${loading || code.length !== 6 ? 'opacity-50' : ''}`}
                            onPress={() => submit()}
                            disabled={loading || code.length !== 6}
                        >
                            {loading ? (
                                <ActivityIndicator color="#0B1A13" />
                            ) : (
                                <Text className="text-forestDeep text-lg font-bold">Finish setup</Text>
                            )}
                        </TouchableOpacity>

                        <Text className="text-xs text-white/50 text-center mt-4 leading-5">
                            Finish within {expiresInMinutes} minutes. If time runs out, log in again to restart setup.
                        </Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}
