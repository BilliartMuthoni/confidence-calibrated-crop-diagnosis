import React, { useEffect, useRef, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as AuthService from '../../api/AuthService';
import { toFriendlyError } from '../../utils/errorMessages';
import ErrorBanner from '../../components/ErrorBanner';
import SocialSignIn from '../../components/SocialSignIn';
import BusyOverlay from '../../components/BusyOverlay';
import useKeyboardScroll from '../../utils/useKeyboardScroll';

export default function SignUpScreen({ navigation, route }) {
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
    // The keyboard's Enter key: "Next" moves phone/email -> Password -> Confirm; "Done" there only
    // closes the keyboard, so the farmer sees the terms box before signing up.
    const passwordRef = useRef(null);
    const confirmRef = useRef(null);
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // "I agree to the Terms of use and Privacy policy" (t50): Sign up and Google wait for it.
    const [agreed, setAgreed] = useState(false);
    // "I agree to both" on the reading screen comes back here with agreed: tick the box.
    useEffect(() => {
        if (route.params?.agreed) {
            setAgreed(true);
            navigation.setParams({ agreed: undefined });
        }
    }, [route.params?.agreed, navigation]);
    const readTerms = (page) => navigation.navigate('Info', { page, agree: 'signup' });

    const handleSignUpSubmit = async () => {
        setError(null);
        if (!agreed) {
            setError({ title: 'Agree to the terms', message: 'Tick the box to agree to the Terms of use and Privacy policy.', retryable: false });
            return;
        }

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
            // An email is confirmed with a code first; then the authenticator app is set up.
            navigation.navigate(...AuthService.challengeScreen(data));
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
            {/* Content stops below the status bar (the app draws edge to edge); the gradient fills behind it. */}
            <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
            <KeyboardAvoidingView
                behavior="padding"
                className="flex-1"
            >
                <ScrollView ref={scrollRef} contentContainerClassName="flex-grow pb-10" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
                    <View className="pt-3 px-5">
                        <TouchableOpacity
                            onPress={() => navigation.goBack()}
                            className="p-2.5 self-start flex-row items-center"
                        >
                            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                            <Text className="text-white text-base font-semibold ml-1">Back</Text>
                        </TouchableOpacity>
                    </View>

                    <View className="flex-1 px-8 pt-2.5">
                        <Text className="text-3xl font-bold text-white text-center">Create account</Text>
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
                                    <Text className="text-white text-base font-semibold mb-2 ml-1">Phone number</Text>
                                    <TextInput
                                        className="bg-white/10 border border-white/20 rounded-2xl px-4 py-3.5 text-base text-white"
                                        placeholder="0712 345 678"
                                        placeholderTextColor="rgba(255,255,255,0.4)"
                                        keyboardType="phone-pad"
                                        value={phoneNumber}
                                        onChangeText={setPhoneNumber}
                                        returnKeyType="next"
                                        submitBehavior="submit"
                                        onSubmitEditing={() => passwordRef.current?.focus()}
                                    />
                                </View>
                            ) : (
                                <View className="mb-4">
                                    <Text className="text-white text-base font-semibold mb-2 ml-1">Email address</Text>
                                    <TextInput
                                        className="bg-white/10 border border-white/20 rounded-2xl px-4 py-3.5 text-base text-white"
                                        placeholder="you@example.com"
                                        placeholderTextColor="rgba(255,255,255,0.4)"
                                        autoCapitalize="none"
                                        keyboardType="email-address"
                                        value={email}
                                        onChangeText={(text) => {
                                            setEmail(text);
                                            setConfirmWithGoogle(false);
                                        }}
                                        returnKeyType="next"
                                        submitBehavior="submit"
                                        onSubmitEditing={() => passwordRef.current?.focus()}
                                    />
                                </View>
                            )}

                            <View className="mb-4">
                                <Text className="text-white text-base font-semibold mb-2 ml-1">Password</Text>
                                <View className="flex-row items-center bg-white/10 border border-white/20 rounded-2xl px-4">
                                    <TextInput
                                        className="flex-1 py-3.5 text-base text-white"
                                        placeholder="At least 8 characters"
                                        placeholderTextColor="rgba(255,255,255,0.4)"
                                        secureTextEntry={!showPassword}
                                        value={password}
                                        onChangeText={setPassword}
                                        ref={passwordRef}
                                        returnKeyType="next"
                                        submitBehavior="submit"
                                        onSubmitEditing={() => confirmRef.current?.focus()}
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
                                <Text className="text-white text-base font-semibold mb-2 ml-1">Confirm password</Text>
                                <TextInput
                                    className="bg-white/10 border border-white/20 rounded-2xl px-4 py-3.5 text-base text-white"
                                    placeholder="••••••••"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    secureTextEntry={!showPassword}
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    ref={confirmRef}
                                    returnKeyType="done"
                                />
                            </View>

                            <View className="flex-row items-start mb-4 mt-1">
                                <TouchableOpacity
                                    onPress={() => setAgreed((v) => !v)}
                                    accessibilityRole="checkbox"
                                    accessibilityState={{ checked: agreed }}
                                    accessibilityLabel="I agree to the Terms of use and Privacy policy"
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                    className={`w-6 h-6 rounded-md border-2 items-center justify-center mr-3 mt-0.5 ${agreed ? 'bg-white border-white' : 'border-white/60'}`}
                                >
                                    {agreed && <Ionicons name="checkmark" size={16} color="#1B4332" />}
                                </TouchableOpacity>
                                <Text className="flex-1 text-white/80 text-base leading-6">
                                    I agree to the{' '}
                                    <Text className="text-white font-bold underline" onPress={() => readTerms('terms')}>
                                        Terms of use
                                    </Text>
                                    {' '}and{' '}
                                    <Text className="text-white font-bold underline" onPress={() => readTerms('privacy')}>
                                        Privacy policy
                                    </Text>
                                </Text>
                            </View>

                            {error && (
                                <View className="mb-4">
                                    <ErrorBanner error={error} tone="dark" onDismiss={() => setError(null)} />
                                </View>
                            )}

                            <TouchableOpacity
                                className={`bg-white py-4 rounded-2xl items-center mt-4 shadow-lg ${loading || !agreed ? 'opacity-50' : ''}`}
                                onPress={handleSignUpSubmit}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#1B4332" />
                                ) : (
                                    <Text className="text-primary text-lg font-bold">Create account</Text>
                                )}
                            </TouchableOpacity>
                        </View>

                        <SocialSignIn
                            navigation={navigation}
                            onSignedIn={confirmWithGoogle ? addPasswordAfterGoogle : undefined}
                            disabled={!agreed}
                            agreedToTerms={agreed}
                        />

                        <View className="flex-row justify-center mt-6">
                            <Text className="text-white/70 text-base">Already have an account? </Text>
                            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
                                <Text className="text-white text-base font-bold underline">Log in</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
            </SafeAreaView>
        </LinearGradient>
    );
}
