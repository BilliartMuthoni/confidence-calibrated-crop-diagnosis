import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as AuthService from '../../api/AuthService';
import { toFriendlyError } from '../../utils/errorMessages';
import ErrorBanner from '../../components/ErrorBanner';
import CodeInput from '../../components/CodeInput';
import BusyOverlay from '../../components/BusyOverlay';

// Confirm the email (t08) or phone number (t22): the 6-digit code sent there at sign-up, or at
// sign-in when it was never confirmed. A right code goes on to the authenticator, as before.
export default function EmailCodeScreen({ route, navigation }) {
    const { email, phone, byPhone = false } = route.params;
    const verify = byPhone ? AuthService.verifyPhoneCode : AuthService.verifyEmailCode;
    const resendCode = byPhone ? AuthService.resendPhoneCode : AuthService.resendEmailCode;
    const [mfaToken, setMfaToken] = useState(route.params.mfaToken);
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    // Seconds until "Send a new code" works (the backend allows one a minute).
    const [wait, setWait] = useState(route.params.resendInSeconds ?? 60);

    useEffect(() => {
        if (wait <= 0) return undefined;
        const timer = setTimeout(() => setWait((w) => w - 1), 1000);
        return () => clearTimeout(timer);
    }, [wait]);

    const submit = async (value = code) => {
        if (value.length !== 6 || loading) return;
        setLoading(true);
        setError(null);
        setNotice(null);
        try {
            const data = await verify({ mfaToken, code: value });
            // Confirmed: on to the authenticator (set up, or its code).
            navigation.replace(...AuthService.challengeScreen(data));
        } catch (e) {
            setError(toFriendlyError(e));
            setCode('');
        } finally {
            setLoading(false);
        }
    };

    const resend = async () => {
        if (wait > 0 || sending) return;
        setSending(true);
        setError(null);
        setNotice(null);
        try {
            const data = await resendCode({ mfaToken });
            setMfaToken(data.mfa_token);
            setWait(data.resend_in_seconds ?? 60);
            setCode('');
            setNotice('A new code is on its way. Earlier codes no longer work.');
        } catch (e) {
            setError(toFriendlyError(e));
        } finally {
            setSending(false);
        }
    };

    return (
        <LinearGradient colors={['#0B1A13', '#1B3D2F', '#2D5A43']} style={{ flex: 1 }}>
            <StatusBar style="light" />
            <BusyOverlay visible={loading} message="Checking your code" />
            <KeyboardAvoidingView behavior="padding" className="flex-1">
                <View className="pt-12 px-5">
                    <TouchableOpacity onPress={() => navigation.goBack()} className="p-2.5 self-start flex-row items-center">
                        <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                        <Text className="text-white text-base font-semibold ml-1">Back</Text>
                    </TouchableOpacity>
                </View>

                <View className="flex-1 px-8 pt-10 items-center">
                    <Ionicons name={byPhone ? 'chatbubble-ellipses' : 'mail'} size={32} color="#FFFFFF" style={{ marginBottom: 10 }} />
                    <Text className="text-2xl font-bold text-white mb-2.5 text-center">
                        {byPhone ? 'Check your messages' : 'Check your email'}
                    </Text>
                    <Text className="text-base text-white/70 text-center mb-8 leading-6">
                        We sent a 6-digit code {byPhone ? 'by SMS ' : ''}to{' '}
                        <Text className="text-white font-semibold">{byPhone ? phone : email}</Text>. Type it below to
                        confirm this {byPhone ? 'number' : 'email'} is yours.
                    </Text>

                    <CodeInput value={code} onChangeText={setCode} onComplete={submit} />

                    {error && (
                        <View className="w-full mt-4">
                            <ErrorBanner error={error} tone="dark" onDismiss={() => setError(null)} />
                        </View>
                    )}
                    {notice && !error && (
                        <Text className="text-sm text-white/80 text-center mt-4">{notice}</Text>
                    )}

                    <TouchableOpacity
                        className={`bg-white py-[18px] rounded-2xl items-center w-full mt-6 shadow-lg ${loading || code.length !== 6 ? 'opacity-50' : ''}`}
                        onPress={() => submit()}
                        disabled={loading || code.length !== 6}
                    >
                        {loading ? (
                            <ActivityIndicator color="#0B1A13" />
                        ) : (
                            <Text className="text-forestDeep text-lg font-bold">Confirm</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={resend} disabled={wait > 0 || sending} className="py-4 mt-2">
                        <Text className={`text-base font-semibold text-center ${wait > 0 || sending ? 'text-white/40' : 'text-white underline'}`}>
                            {sending ? 'Sending...' : wait > 0 ? `Send a new code in ${wait} s` : 'Send a new code'}
                        </Text>
                    </TouchableOpacity>

                    <Text className="text-sm text-white/50 text-center mt-4 leading-5">
                        {byPhone
                            ? 'The code works for 15 minutes. It can take a minute to arrive. Wrong number? Go back and sign up again with the right one.'
                            : 'The code works for 15 minutes. Not there? Look in Spam or Promotions. Wrong email? Go back and sign up again with the right one.'}
                    </Text>
                </View>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}
