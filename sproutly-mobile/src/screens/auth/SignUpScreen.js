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

export default function SignUpScreen({ navigation }) {
    const scrollRef = useKeyboardScroll();
    const [authMethod, setAuthMethod] = useState('phone'); // 'phone' or 'email'
    // An error belongs to the tab it came from; switching tabs clears it.
    const chooseMethod = (method) => {
        setAuthMethod(method);
        setError(null);
        setConfirmWithGoogle(false);
    };
    // The email already has an account made with Google: the password is added once Google
    // confirms it's theirs (Continue with Google below), never on the typed email alone.
    const [confirmWithGoogle, setConfirmWithGoogle] = useState(false);
    const [phoneNumber, setPhoneNumber] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const handleSignUpSubmit = async () => {
        setError(null);

        if (authMethod === 'phone' && phoneNumber.trim().length < 9) {
            setError({ title: 'Check your phone number', message: 'It looks too short. Enter it like 0712345678.', retryable: false });
            return;
        }
        if (authMethod === 'email' && !email.trim()) {
            setError({ title: 'Email needed', message: 'Enter the email address you want to log in with.', retryable: false });
            return;
        }
        if (password.length < 8) {
            setError({ title: 'Password too short', message: 'Use at least 8 characters so your account stays secure.', retryable: false });
            return;
        }
        if (password !== confirmPassword) {
            setError({ title: 'Passwords do not match', message: 'Type the same password in both boxes.', retryable: false });
            return;
        }

        setLoading(true);
        try {
            const data = await AuthService.register(authMethod === 'phone' ? { phoneNumber, password } : { email, password });
            // The account can't log in until the authenticator app is set up.
            navigation.navigate('MfaSetup', {
                mfaToken: data.mfa_token,
                expiresInMinutes: data.expires_in_minutes,
                setup: data.setup,
            });
        } catch (e) {
            setError(toFriendlyError(e));
            setConfirmWithGoogle(authMethod === 'email' && /account with google/i.test(e.message));
        } finally {
            setLoading(false);
        }
    };

    // Google has confirmed who it is: add the password typed above, then set up the authenticator.
    const addPasswordAfterGoogle = async (tokens) => {
        setError(null);
        try {
            const data = await AuthService.addPassword({ token: tokens.access_token, password, email });
            setConfirmWithGoogle(false);
            navigation.navigate('MfaSetup', {
                mfaToken: data.mfa_token,
                expiresInMinutes: data.expires_in_minutes,
                setup: data.setup,
            });
        } catch (e) {
            setError(toFriendlyError(e));
        }
    };

    return (
        <LinearGradient colors={['#0B1A13', '#1B3D2F', '#2D5A43']} style={{ flex: 1 }}>
            <StatusBar style="light" />
            <BusyOverlay visible={loading} message="Creating your account" />
            <KeyboardAvoidingView
                behavior="padding"
                className="flex-1"
            >
                <ScrollView ref={scrollRef} contentContainerClassName="flex-grow pb-10" keyboardShouldPersistTaps="handled">
                    <View className="pt-12 px-5">
                        <TouchableOpacity
                            onPress={() => navigation.goBack()}
                            className="p-2.5 self-start flex-row items-center"
                        >
                            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                            <Text className="text-white text-base font-semibold ml-1">Back</Text>
                        </TouchableOpacity>
                    </View>

                    <View className="flex-1 px-8 pt-2.5">
                        <Text className="text-3xl font-bold text-white text-center">Create Account</Text>
                        <Text className="text-base text-white/70 text-center mb-6">Join the Sproutly community</Text>

                        {/* Method Selector */}
                        <View className="flex-row mb-6 bg-white/10 rounded-2xl p-1 border border-white/10">
                            <TouchableOpacity
                                className={`flex-1 py-3 items-center justify-center rounded-xl ${authMethod === 'phone' ? 'bg-white/20' : ''}`}
                                onPress={() => chooseMethod('phone')}
                            >
                                <Text className={`text-base font-semibold ${authMethod === 'phone' ? 'text-white' : 'text-white/60'}`}>
                                    Phone
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                className={`flex-1 py-3 items-center justify-center rounded-xl ${authMethod === 'email' ? 'bg-white/20' : ''}`}
                                onPress={() => chooseMethod('email')}
                            >
                                <Text className={`text-base font-semibold ${authMethod === 'email' ? 'text-white' : 'text-white/60'}`}>
                                    Email
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {/* Glassy Inputs */}
                        <View>
                            {authMethod === 'phone' ? (
                                <View className="mb-4">
                                    <Text className="text-white text-sm font-semibold mb-2 ml-1">Phone Number</Text>
                                    <TextInput
                                        className="bg-white/10 border border-white/20 rounded-2xl px-4 py-3.5 text-base text-white"
                                        placeholder="0712 345 678"
                                        placeholderTextColor="rgba(255,255,255,0.4)"
                                        keyboardType="phone-pad"
                                        value={phoneNumber}
                                        onChangeText={setPhoneNumber}
                                    />
                                </View>
                            ) : (
                                <View className="mb-4">
                                    <Text className="text-white text-sm font-semibold mb-2 ml-1">Email Address</Text>
                                    <TextInput
                                        className="bg-white/10 border border-white/20 rounded-2xl px-4 py-3.5 text-base text-white"
                                        placeholder="farmer@sproutly.com"
                                        placeholderTextColor="rgba(255,255,255,0.4)"
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                        value={email}
                                        onChangeText={(text) => {
                                            setEmail(text);
                                            setConfirmWithGoogle(false);
                                        }}
                                    />
                                </View>
                            )}

                            <View className="mb-4">
                                <Text className="text-white text-sm font-semibold mb-2 ml-1">Password</Text>
                                <View className="flex-row items-center bg-white/10 border border-white/20 rounded-2xl px-4">
                                    <TextInput
                                        className="flex-1 py-3.5 text-base text-white"
                                        placeholder="At least 8 characters"
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
                            <View className="mb-4">
                                <Text className="text-white text-sm font-semibold mb-2 ml-1">Confirm Password</Text>
                                <TextInput
                                    className="bg-white/10 border border-white/20 rounded-2xl px-4 py-3.5 text-base text-white"
                                    placeholder="••••••••"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    secureTextEntry={!showPassword}
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                />
                            </View>

                            {error && (
                                <View className="mb-4">
                                    <ErrorBanner error={error} tone="dark" onDismiss={() => setError(null)} />
                                </View>
                            )}

                            <TouchableOpacity
                                className={`bg-white py-4 rounded-2xl items-center mt-4 shadow-lg ${loading ? 'opacity-70' : ''}`}
                                onPress={handleSignUpSubmit}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#1B4332" />
                                ) : (
                                    <Text className="text-primary text-lg font-bold">Sign Up</Text>
                                )}
                            </TouchableOpacity>
                        </View>

                        <SocialSignIn
                            navigation={navigation}
                            onSignedIn={confirmWithGoogle ? addPasswordAfterGoogle : undefined}
                        />

                        <View className="flex-row justify-center mt-6">
                            <Text className="text-white/70 text-sm">Already have an account? </Text>
                            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                                <Text className="text-white text-sm font-bold underline">Login</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}
