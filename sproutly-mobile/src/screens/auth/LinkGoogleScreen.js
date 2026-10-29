import React, { useState, useContext } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    ActivityIndicator,
} from 'react-native';
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

// After Continue with Google, when the email already has a Sproutly password account: the farmer
// proves it's theirs (password, plus the authenticator code if set up) and Google is joined to it.
export default function LinkGoogleScreen({ route, navigation }) {
    const scrollRef = useKeyboardScroll();
    const { linkToken, email, needsCode } = route.params;
    const { login } = useContext(AuthContext);
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const ready = password.length > 0 && (!needsCode || code.length === 6);

    const submit = async () => {
        if (!ready || loading) return;
        setLoading(true);
        setError(null);
        try {
            const result = await AuthService.linkGoogle({ linkToken, password, code: needsCode ? code : undefined });
            if (result.challenge) {
                // Sign-up stopped before the authenticator: set it up now.
                navigation.navigate('MfaSetup', {
                    mfaToken: result.challenge.mfa_token,
                    expiresInMinutes: result.challenge.expires_in_minutes,
                    setup: result.challenge.setup,
                });
                return;
            }
            const { tokens } = result;
            await login(tokens.access_token, [tokens.role], tokens.refresh_token);
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
            <BusyOverlay visible={loading} message="Linking your Google account" />
            <KeyboardAvoidingView behavior="padding" className="flex-1">
                <ScrollView ref={scrollRef} contentContainerClassName="flex-grow pb-10" keyboardShouldPersistTaps="handled">
                    <View className="pt-12 px-5">
                        <TouchableOpacity onPress={() => navigation.goBack()} className="p-2.5 self-start flex-row items-center">
                            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                            <Text className="text-white text-base font-semibold ml-1">Back</Text>
                        </TouchableOpacity>
                    </View>

                    <View className="flex-1 px-8 pt-6">
                        <Ionicons name="link" size={32} color="#FFFFFF" style={{ alignSelf: 'center', marginBottom: 10 }} />
                        <Text className="text-2xl font-bold text-white mb-2.5 text-center">Connect Google</Text>
                        <Text className="text-base text-white/70 text-center mb-8 leading-6">
                            You already have a Sproutly account with {email}. Enter its password
                            {needsCode ? ' and the code from your authenticator app' : ''} to confirm it's yours. After
                            this, Continue with Google opens the same account.
                        </Text>

                        <Text className="text-white text-sm font-semibold mb-2 ml-1">Sproutly password</Text>
                        <View className="flex-row items-center bg-white/10 border border-white/20 rounded-2xl px-4 mb-5">
                            <TextInput
                                className="flex-1 py-3.5 text-base text-white"
                                placeholder="Your Sproutly password, not Google's"
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                secureTextEntry={!showPassword}
                                value={password}
                                onChangeText={setPassword}
                                autoFocus
                            />
                            <TouchableOpacity
                                onPress={() => setShowPassword((v) => !v)}
                                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                            >
                                <Ionicons
                                    name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                                    size={20}
                                    color="rgba(255,255,255,0.6)"
                                />
                            </TouchableOpacity>
                        </View>

                        {needsCode && (
                            <View className="mb-2">
                                <Text className="text-white text-sm font-semibold mb-2 ml-1">Authenticator code</Text>
                                <CodeInput value={code} onChangeText={setCode} autoFocus={false} />
                            </View>
                        )}

                        {error && (
                            <View className="mt-4">
                                <ErrorBanner error={error} tone="dark" onDismiss={() => setError(null)} />
                            </View>
                        )}

                        <TouchableOpacity
                            className={`bg-white py-[18px] rounded-2xl items-center w-full mt-6 shadow-lg ${loading || !ready ? 'opacity-50' : ''}`}
                            onPress={submit}
                            disabled={loading || !ready}
                        >
                            {loading ? (
                                <ActivityIndicator color="#0B1A13" />
                            ) : (
                                <Text className="text-forestDeep text-lg font-bold">Connect and log in</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}
