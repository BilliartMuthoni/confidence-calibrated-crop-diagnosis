import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import * as AuthService from '../../api/AuthService';
import { toFriendlyError } from '../../utils/errorMessages';
import { CONTACT_EMAIL } from '../../constants/accountText';
import ErrorBanner from '../../components/ErrorBanner';
import CodeInput from '../../components/CodeInput';
import BusyOverlay from '../../components/BusyOverlay';
import useKeyboardScroll from '../../utils/useKeyboardScroll';

// "Forgot password?", step 2: the code we sent, the authenticator code (or a backup code, for a
// lost phone) and the new password. Both codes are needed, so a stolen SIM card or inbox alone
// can't take an account. Afterwards every phone is signed out and the farmer logs in again.
export default function ResetPasswordScreen({ route, navigation }) {
    const { method, value } = route.params;
    const byPhone = method === 'phone';
    const scrollRef = useKeyboardScroll();
    const [resetToken, setResetToken] = useState(route.params.resetToken);
    const [code, setCode] = useState('');
    const [useBackup, setUseBackup] = useState(false);
    const [mfaCode, setMfaCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);
    // Seconds until "Send a new code" works (one a minute).
    const [wait, setWait] = useState(route.params.resendInSeconds ?? 60);
    const mfaRef = useRef(null);
    const passwordRef = useRef(null);
    const confirmRef = useRef(null);

    useEffect(() => {
        if (wait <= 0) return undefined;
        const timer = setTimeout(() => setWait((w) => w - 1), 1000);
        return () => clearTimeout(timer);
    }, [wait]);

    const submit = async () => {
        setError(null);
        setNotice(null);
        if (code.length !== 6) {
            setError({ title: 'Enter the code we sent', message: `Type the 6-digit code from the ${byPhone ? 'SMS' : 'email'}.`, retryable: false });
            return;
        }
        if (!mfaCode.trim()) {
            setError(useBackup
                ? { title: 'Backup code needed', message: 'Type one of your backup codes, like 1234-5678.', retryable: false }
                : { title: 'Authenticator code needed', message: 'Type the 6-digit code shown under Sproutly in your authenticator app.', retryable: false });
            return;
        }
        if (newPassword.length < 8) {
            setError({ title: 'Password too short', message: 'Use at least 8 characters so your account stays secure.', retryable: false });
            return;
        }
        if (newPassword !== confirmPassword) {
            setError({ title: 'Passwords do not match', message: 'Type the same new password in both boxes.', retryable: false });
            return;
        }
        setLoading(true);
        try {
            await AuthService.resetPassword({
                resetToken,
                code,
                mfaCode: useBackup ? undefined : mfaCode.trim(),
                backupCode: useBackup ? mfaCode.trim() : undefined,
                newPassword,
            });
            navigation.navigate('Login', {
                method,
                value,
                notice: 'Password changed. Log in with your new password.',
            });
        } catch (e) {
            setError(toFriendlyError(e));
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
            const data = await AuthService.forgotPassword(byPhone ? { phoneNumber: value } : { email: value });
            setResetToken(data.reset_token);
            setWait(data.resend_in_seconds ?? 60);
            setCode('');
            setNotice('A new code has been sent. Earlier codes no longer work.');
        } catch (e) {
            setError(toFriendlyError(e));
        } finally {
            setSending(false);
        }
    };

    const inputClass = 'bg-black/20 border border-glassBorder rounded-xl px-4 py-4 text-base text-white';

    return (
        <LinearGradient colors={['#0B1A13', '#1B3D2F', '#2D5A43']} style={{ flex: 1 }}>
            <StatusBar style="light" />
            <BusyOverlay visible={loading} message="Changing your password" />
            <SafeAreaView edges={['top', 'bottom']} style={{ flex: 1 }}>
            <KeyboardAvoidingView behavior="padding" className="flex-1">
                <ScrollView ref={scrollRef} contentContainerClassName="flex-grow pb-10" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
                    <View className="pt-3 px-5">
                        <TouchableOpacity onPress={() => navigation.goBack()} className="p-2.5 self-start flex-row items-center">
                            <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                            <Text className="text-white text-base font-semibold ml-1">Back</Text>
                        </TouchableOpacity>
                    </View>

                    <View className="flex-1 px-8 pt-5">
                        <Text className="text-3xl font-bold text-white mb-1 text-center">Reset your password</Text>
                        <Text className="text-base text-white/70 mb-6 text-center leading-6">
                            If an account uses <Text className="text-white font-semibold">{value}</Text>, we sent it a
                            6-digit code {byPhone ? 'by SMS' : 'by email'}.
                        </Text>

                        <Text className="text-base font-semibold text-white mb-2">Code we sent</Text>
                        <CodeInput value={code} onChangeText={setCode} onComplete={() => mfaRef.current?.focus()} />
                        <TouchableOpacity onPress={resend} disabled={wait > 0 || sending} className="py-3 mb-2">
                            <Text className={`text-base font-semibold text-center ${wait > 0 || sending ? 'text-white/40' : 'text-white underline'}`}>
                                {sending ? 'Sending...' : wait > 0 ? `Send a new code in ${wait} s` : 'Send a new code'}
                            </Text>
                        </TouchableOpacity>

                        <View className="mb-5">
                            <Text className="text-base font-semibold text-white mb-2">
                                {useBackup ? 'Backup code' : 'Code from your authenticator app'}
                            </Text>
                            <TextInput
                                ref={mfaRef}
                                className={inputClass}
                                placeholder={useBackup ? '1234-5678' : '6 digits'}
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                keyboardType="number-pad"
                                maxLength={useBackup ? 9 : 6}
                                value={mfaCode}
                                onChangeText={setMfaCode}
                                returnKeyType="next"
                                submitBehavior="submit"
                                onSubmitEditing={() => passwordRef.current?.focus()}
                            />
                            <TouchableOpacity
                                onPress={() => { setUseBackup((b) => !b); setMfaCode(''); }}
                                className="self-end pt-2"
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                                <Text className="text-white text-sm font-semibold underline">
                                    {useBackup ? 'Use the authenticator app instead' : 'Lost your phone? Use a backup code'}
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <View className="mb-5">
                            <Text className="text-base font-semibold text-white mb-2">New password</Text>
                            <View className="flex-row items-center bg-black/20 border border-glassBorder rounded-xl px-4">
                                <TextInput
                                    ref={passwordRef}
                                    className="flex-1 py-4 text-base text-white"
                                    placeholder="At least 8 characters"
                                    placeholderTextColor="rgba(255,255,255,0.4)"
                                    secureTextEntry={!showPassword}
                                    value={newPassword}
                                    onChangeText={setNewPassword}
                                    returnKeyType="next"
                                    submitBehavior="submit"
                                    onSubmitEditing={() => confirmRef.current?.focus()}
                                />
                                <TouchableOpacity
                                    onPress={() => setShowPassword((v) => !v)}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                    <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color="rgba(255,255,255,0.6)" />
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View className="mb-5">
                            <Text className="text-base font-semibold text-white mb-2">Confirm new password</Text>
                            <TextInput
                                ref={confirmRef}
                                className={inputClass}
                                placeholder="••••••••"
                                placeholderTextColor="rgba(255,255,255,0.4)"
                                secureTextEntry={!showPassword}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                returnKeyType="go"
                                onSubmitEditing={submit}
                            />
                        </View>

                        {error && (
                            <View className="mb-4">
                                <ErrorBanner error={error} tone="dark" onDismiss={() => setError(null)} />
                            </View>
                        )}
                        {notice && !error && (
                            <Text className="text-base text-white/80 text-center mb-4">{notice}</Text>
                        )}

                        <TouchableOpacity
                            className={`bg-white py-[18px] rounded-xl items-center mt-2.5 shadow-lg ${loading ? 'opacity-70' : ''}`}
                            onPress={submit}
                            disabled={loading}
                        >
                            {loading ? (
                                <ActivityIndicator color="#1B4332" />
                            ) : (
                                <Text className="text-primary text-lg font-bold">Change password</Text>
                            )}
                        </TouchableOpacity>

                        <Text className="text-sm text-white/60 text-center mt-6 leading-5">
                            Lost your phone and your backup codes? Email {CONTACT_EMAIL} from the email or phone number on your account.
                        </Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
            </SafeAreaView>
        </LinearGradient>
    );
}
