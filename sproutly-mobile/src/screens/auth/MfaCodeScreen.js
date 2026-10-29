import React, { useState, useContext } from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import * as AuthService from '../../api/AuthService';
import { toFriendlyError } from '../../utils/errorMessages';
import ErrorBanner from '../../components/ErrorBanner';
import CodeInput from '../../components/CodeInput';
import BusyOverlay from '../../components/BusyOverlay';

// Second step of login: the password was right, now the code from the authenticator app.
export default function MfaCodeScreen({ route, navigation }) {
    const { mfaToken } = route.params;
    const { login } = useContext(AuthContext);
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    // Lost or broken phone: one of the ten backup codes made in Account instead.
    const [useBackup, setUseBackup] = useState(false);
    const [backup, setBackup] = useState('');

    const switchMode = () => {
        setUseBackup((v) => !v);
        setError(null);
    };

    const submitBackup = async () => {
        if (!backup.trim() || loading) return;
        setLoading(true);
        setError(null);
        try {
            const data = await AuthService.verifyBackupCode({ mfaToken, code: backup.trim() });
            await login(data.access_token, [data.role], data.refresh_token);
        } catch (e) {
            setError(toFriendlyError(e));
        } finally {
            setLoading(false);
        }
    };

    const submit = async (value = code) => {
        if (value.length !== 6 || loading) return;
        setLoading(true);
        setError(null);
        try {
            const data = await AuthService.verifyMfa({ mfaToken, code: value });
            // RootNavigator switches to the farmer screens once the token is stored.
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
                <View className="pt-12 px-5">
                    <TouchableOpacity onPress={() => navigation.goBack()} className="p-2.5 self-start flex-row items-center">
                        <Ionicons name="arrow-back" size={20} color="#FFFFFF" />
                        <Text className="text-white text-base font-semibold ml-1">Back</Text>
                    </TouchableOpacity>
                </View>

                <View className="flex-1 px-8 pt-10 items-center">
                    <Ionicons name="shield-checkmark" size={32} color="#FFFFFF" style={{ marginBottom: 10 }} />
                    <Text className="text-2xl font-bold text-white mb-2.5 text-center">
                        {useBackup ? 'Enter a backup code' : 'Enter your code'}
                    </Text>
                    <Text className="text-base text-white/70 text-center mb-8 leading-6">
                        {useBackup
                            ? 'Type one of the backup codes you saved, like 4821-0937. Each code works once.'
                            : 'Open Google Authenticator or Microsoft Authenticator and type the 6-digit code shown under Sproutly.'}
                    </Text>

                    {useBackup ? (
                        <TextInput
                            value={backup}
                            onChangeText={setBackup}
                            keyboardType="number-pad"
                            autoCorrect={false}
                            autoFocus
                            placeholder="4821-0937"
                            placeholderTextColor="rgba(255,255,255,0.25)"
                            accessibilityLabel="Backup code"
                            className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 text-center text-2xl font-bold text-white"
                            style={{ letterSpacing: 4 }}
                        />
                    ) : (
                        <CodeInput value={code} onChangeText={setCode} onComplete={submit} />
                    )}

                    {error && (
                        <View className="w-full mt-4">
                            <ErrorBanner error={error} tone="dark" onDismiss={() => setError(null)} />
                        </View>
                    )}

                    <TouchableOpacity
                        className={`bg-white py-[18px] rounded-2xl items-center w-full mt-6 shadow-lg ${loading || (useBackup ? !backup.trim() : code.length !== 6) ? 'opacity-50' : ''}`}
                        onPress={() => (useBackup ? submitBackup() : submit())}
                        disabled={loading || (useBackup ? !backup.trim() : code.length !== 6)}
                    >
                        {loading ? (
                            <ActivityIndicator color="#0B1A13" />
                        ) : (
                            <Text className="text-forestDeep text-lg font-bold">Log in</Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={switchMode} className="py-4 mt-2">
                        <Text className="text-base text-white font-semibold underline text-center">
                            {useBackup ? 'Use the authenticator app instead' : 'Lost your phone? Use a backup code'}
                        </Text>
                    </TouchableOpacity>

                    {!useBackup && (
                        <Text className="text-sm text-white/50 text-center mt-4 leading-5">
                            The code changes every 30 seconds. If it is about to change, wait for the next one.
                        </Text>
                    )}
                </View>
            </KeyboardAvoidingView>
        </LinearGradient>
    );
}
