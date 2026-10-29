import React, { useState, useContext } from 'react';
import { View, Text, TextInput, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthContext } from '../../context/AuthContext';
import { changePassword } from '../../api/AuthService';
import { toFriendlyError } from '../../utils/errorMessages';
import ErrorBanner from '../../components/ErrorBanner';
import ScreenHeader from '../../components/ScreenHeader';
import { PrimaryButton } from '../../components/Buttons';
import { COLORS } from '../../constants/theme';
import BusyOverlay from '../../components/BusyOverlay';
import { showDialog } from '../../components/Dialog';
import useKeyboardScroll from '../../utils/useKeyboardScroll';

export const inputStyle = {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.divider,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: COLORS.ink,
};

export function Field({ label, ...input }) {
    return (
        <View className="mb-4">
            <Text className="text-sm font-semibold mb-2" style={{ color: COLORS.ink }}>
                {label}
            </Text>
            <TextInput style={inputStyle} placeholderTextColor={COLORS.faint} {...input} />
        </View>
    );
}

/** Change the password; this phone gets a fresh sign-in and any other phone is signed out. */
export default function ChangePasswordScreen({ navigation }) {
    const scrollRef = useKeyboardScroll();
    const { userToken, userRoles, login } = useContext(AuthContext);
    const [current, setCurrent] = useState('');
    const [next, setNext] = useState('');
    const [again, setAgain] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const submit = async () => {
        setError(null);
        if (next.length < 8) {
            setError({ title: 'Password too short', message: 'Use at least 8 characters.', retryable: false });
            return;
        }
        if (next !== again) {
            setError({ title: 'Passwords do not match', message: 'Type the same new password in both boxes.', retryable: false });
            return;
        }
        setLoading(true);
        try {
            const tokens = await changePassword({ token: userToken, currentPassword: current, newPassword: next });
            await login(tokens.access_token, userRoles, tokens.refresh_token);
            showDialog('Password changed', 'Use your new password next time. Any other phone signed in to your account has been signed out.');
            navigation.goBack();
        } catch (e) {
            setError(toFriendlyError(e));
        } finally {
            setLoading(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <BusyOverlay visible={loading} message="Changing your password" />
            <ScreenHeader title="Change password" onBack={() => navigation.goBack()} />
            <KeyboardAvoidingView behavior="padding" className="flex-1">
                <ScrollView ref={scrollRef} contentContainerClassName="px-5 pb-10" keyboardShouldPersistTaps="handled">
                    <Field label="Current password" secureTextEntry value={current} onChangeText={setCurrent} autoFocus />
                    <Field label="New password" secureTextEntry value={next} onChangeText={setNext} placeholder="At least 8 characters" />
                    <Field label="New password again" secureTextEntry value={again} onChangeText={setAgain} />
                    {error && (
                        <View className="mb-4">
                            <ErrorBanner error={error} onDismiss={() => setError(null)} />
                        </View>
                    )}
                    <PrimaryButton label="Change password" onPress={submit} loading={loading} disabled={!current || !next || !again} />
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
