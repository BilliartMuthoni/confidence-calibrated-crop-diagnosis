import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as AuthService from '../../api/AuthService';
import { toFriendlyError } from '../../utils/errorMessages';
import ErrorBanner from '../../components/ErrorBanner';
import BusyOverlay from '../../components/BusyOverlay';

// "Forgot password?", step 1: the phone number or email the farmer logs in with. A code goes
// there (SMS or email); step 2 (ResetPasswordScreen) asks for it with the authenticator code.
// The answer looks the same whether or not an account uses it, so nobody can test numbers here.
export default function ForgotPasswordScreen({ route, navigation }) {
    const [authMethod, setAuthMethod] = useState(route.params?.method || 'phone');
    const [value, setValue] = useState(route.params?.value || '');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const chooseMethod = (method) => {
        setAuthMethod(method);
        setValue('');
        setError(null);
    };

    const send = async () => {
        setError(null);
        if (authMethod === 'phone' && value.trim().length < 9) {
            setError({ title: 'Check your phone number', message: 'It looks too short. Enter it like 0712345678.', retryable: false });
            return;
        }
        if (authMethod === 'email' && !value.trim()) {
            setError({ title: 'Email needed', message: 'Enter the email address you log in with.', retryable: false });
            return;
        }
        setLoading(true);
        try {
            const login = authMethod === 'phone' ? { phoneNumber: value.trim() } : { email: value.trim() };
            const data = await AuthService.forgotPassword(login);
            navigation.replace('ResetPassword', {
                resetToken: data.reset_token,
                resendInSeconds: data.resend_in_seconds,
                method: authMethod,
                value: value.trim(),
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
            <BusyOverlay visible={loading} message="Sending your code" />
            <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
            <KeyboardAvoidingView behavior="padding" className="flex-1">
                <ScrollView contentContainerClassName="flex-grow pb-10" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
                    <View className="pt-3 px-5">
                        <TouchableOpacity onPress={() => navigation.goBack()} className="p-2.5 self-start flex-row items-center">
                            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                            <Text className="text-white text-base font-semibold ml-1">Back</Text>
                        </TouchableOpacity>
                    </View>

                    <View className="flex-1 px-8 pt-5">
                        <Text className="text-3xl font-bold text-white mb-1 text-center">Forgot password?</Text>
                        <Text className="text-base text-white/70 mb-8 text-center">
                            We'll send a code to the phone number or email you log in with.
                        </Text>

                        <View className="flex-row mb-8 bg-black/20 rounded-xl p-1">
                            {['phone', 'email'].map((method) => (
                                <TouchableOpacity
                                    key={method}
                                    className={`flex-1 py-3 items-center justify-center rounded-lg ${authMethod === method ? 'bg-white/15' : ''}`}
                                    onPress={() => chooseMethod(method)}
                                >
                                    <Text className={`text-base font-semibold ${authMethod === method ? 'text-white' : 'text-white/60'}`}>
                                        {method === 'phone' ? 'Phone' : 'Email'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <View className="mb-5">
                            <Text className="text-base font-semibold text-white mb-2">
                                {authMethod === 'phone' ? 'Phone number' : 'Email address'}
                            </Text>
                            <TextInput
                                className="bg-black/20 border border-glassBorder rounded-xl px-4 py-4 text-base text-white"
                                placeholder={authMethod === 'phone' ? '0712 345 678' : 'you@example.com'}
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                keyboardType={authMethod === 'phone' ? 'phone-pad' : 'email-address'}
                                autoCapitalize="none"
                                value={value}
                                onChangeText={setValue}
                                returnKeyType="send"
                                onSubmitEditing={send}
                            />
                        </View>

                        {error && (
                            <View className="mb-4">
                                <ErrorBanner error={error} tone="dark" onDismiss={() => setError(null)} />
                            </View>
                        )}

                        <TouchableOpacity
                            className={`bg-white py-[18px] rounded-xl items-center mt-2.5 shadow-lg ${loading ? 'opacity-70' : ''}`}
                            onPress={send}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#1B4332" />
                            ) : (
                                <Text className="text-primary text-lg font-bold">Send code</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
            </SafeAreaView>
        </LinearGradient>
    );
}
