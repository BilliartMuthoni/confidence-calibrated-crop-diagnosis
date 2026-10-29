import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Alert,
    ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as AuthService from '../../api/AuthService';
import { toFriendlyError } from '../../utils/errorMessages';
import ErrorBanner from '../../components/ErrorBanner';
import SocialSignIn from '../../components/SocialSignIn';
import BusyOverlay from '../../components/BusyOverlay';
import useKeyboardScroll from '../../utils/useKeyboardScroll';

export default function LoginScreen({ navigation }) {
    const scrollRef = useKeyboardScroll();
    const [authMethod, setAuthMethod] = useState('phone');
    // An error belongs to the tab it came from; switching tabs clears it.
    const chooseMethod = (method) => {
        setAuthMethod(method);
        setError(null);
    };
    const [phoneNumber, setPhoneNumber] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleLoginSubmit = async () => {
        setError(null);

        if (authMethod === 'phone' && phoneNumber.trim().length < 9) {
            setError({ title: 'Check your phone number', message: 'It looks too short. Enter it like 0712345678.', retryable: false });
            return;
        }
        if (authMethod === 'email' && !email.trim()) {
            setError({ title: 'Email needed', message: 'Enter the email address you signed up with.', retryable: false });
            return;
        }
        if (!password) {
            setError({ title: 'Password needed', message: 'Enter your password to continue.', retryable: false });
            return;
        }

        setLoading(true);
        try {
            const data = await AuthService.login(authMethod === 'phone' ? { phoneNumber, password } : { email, password });
            // Accounts without MFA yet are sent to setup; the rest just enter their code.
            navigation.navigate(data.next_step === 'setup' ? 'MfaSetup' : 'MfaCode', {
                mfaToken: data.mfa_token,
                expiresInMinutes: data.expires_in_minutes,
                setup: data.setup,
            });
        } catch (e) {
            setError(toFriendlyError(e));
        } finally {
            setLoading(false);
        }
    };

    return (
        <LinearGradient colors={['#0B1A13', '#1B3D2F', '#2D5A43']} style={{ flex: 1 }}>
            <StatusBar style="light" />
            <BusyOverlay visible={loading} message="Signing you in" />
            <KeyboardAvoidingView
                behavior="padding"
                className="flex-1"
            >
                <ScrollView ref={scrollRef} contentContainerClassName="flex-grow">
                    <View className="pt-12 px-5">
                        <TouchableOpacity onPress={() => navigation.goBack()} className="p-2.5 self-start flex-row items-center">
                            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                            <Text className="text-white text-base font-semibold ml-1">Back</Text>
                        </TouchableOpacity>
                    </View>

                    <View className="flex-1 px-8 pt-5">
                        <Text className="text-3xl font-bold text-white mb-1 text-center">Welcome Back</Text>
                        <Text className="text-base text-white/70 mb-8 text-center">
                            Log in to manage your farm with Sproutly
                        </Text>

                        {/* Dark Method Selector */}
                        <View className="flex-row mb-8 bg-black/20 rounded-xl p-1">
                            <TouchableOpacity
                                className={`flex-1 py-3 items-center justify-center rounded-lg ${authMethod === 'phone' ? 'bg-white/15' : ''}`}
                                onPress={() => chooseMethod('phone')}
                            >
                                <Text className={`text-base font-semibold ${authMethod === 'phone' ? 'text-white' : 'text-white/60'}`}>
                                    Phone
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                className={`flex-1 py-3 items-center justify-center rounded-lg ${authMethod === 'email' ? 'bg-white/15' : ''}`}
                                onPress={() => chooseMethod('email')}
                            >
                                <Text className={`text-base font-semibold ${authMethod === 'email' ? 'text-white' : 'text-white/60'}`}>
                                    Email
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Inputs using Glassmorphism */}
                        <View className="mb-5">
                            <Text className="text-sm font-semibold text-white mb-2">
                                {authMethod === 'phone' ? 'Phone Number' : 'Email Address'}
                            </Text>
                            <TextInput
                                className="bg-black/20 border border-glassBorder rounded-xl px-4 py-4 text-base text-white"
                                placeholder={authMethod === 'phone' ? 'e.g. 0712345678' : 'your@email.com'}
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                keyboardType={authMethod === 'phone' ? 'phone-pad' : 'email-address'}
                                autoCapitalize="none"
                                value={authMethod === 'phone' ? phoneNumber : email}
                                onChangeText={authMethod === 'phone' ? setPhoneNumber : setEmail}
                            />
                        </View>

                        <View className="mb-5">
                            <Text className="text-sm font-semibold text-white mb-2">Password</Text>
                            <View className="flex-row items-center bg-black/20 border border-glassBorder rounded-xl px-4">
                                <TextInput
                                    className="flex-1 py-4 text-base text-white"
                                    placeholder="••••••••"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    secureTextEntry={!showPassword}
                                    value={password}
                                    onChangeText={setPassword}
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
                        </View>

                        {error && (
                            <View className="mb-4">
                                <ErrorBanner error={error} tone="dark" onDismiss={() => setError(null)} />
                            </View>
                        )}

                        <TouchableOpacity
                            className={`bg-white py-[18px] rounded-xl items-center mt-2.5 shadow-lg ${loading ? 'opacity-70' : ''}`}
                            onPress={handleLoginSubmit}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#1B4332" />
                            ) : (
                                <Text className="text-primary text-lg font-bold">Continue</Text>
                            )}
                        </TouchableOpacity>

                        <SocialSignIn navigation={navigation} />

                        <View className="flex-row justify-center mt-8 pb-5">
                            <Text className="text-sm text-white/70">Don't have an account? </Text>
                            <TouchableOpacity onPress={() => navigation.navigate('SignUp')}>
                                <Text className="text-sm text-white font-bold underline">Sign Up</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}
