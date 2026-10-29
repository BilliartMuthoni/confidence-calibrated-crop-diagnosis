import React, { useState, useContext } from 'react';
import { View, Text, ScrollView, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { AuthContext } from '../../context/AuthContext';
import { makeBackupCodes } from '../../api/AuthService';
import { toFriendlyError } from '../../utils/errorMessages';
import ErrorBanner from '../../components/ErrorBanner';
import ScreenHeader from '../../components/ScreenHeader';
import CodeInput from '../../components/CodeInput';
import { PrimaryButton, SecondaryButton } from '../../components/Buttons';
import { COLORS } from '../../constants/theme';
import BusyOverlay from '../../components/BusyOverlay';

/**
 * Ten single-use codes for signing in without the authenticator (a lost or broken phone).
 * They are stored scrambled, so they are shown only once, here; making new ones cancels the old.
 */
export default function BackupCodesScreen({ navigation }) {
    const { userToken } = useContext(AuthContext);
    const [code, setCode] = useState('');
    const [codes, setCodes] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const make = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await makeBackupCodes({ token: userToken, code });
            setCodes(data.codes);
        } catch (e) {
            setError(toFriendlyError(e));
            setCode('');
        } finally {
            setLoading(false);
        }
    };

    const share = () =>
        Share.share({ message: `Sproutly backup codes (each works once):\n${codes.join('\n')}` }).catch(() => {});

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <BusyOverlay visible={loading} message="Making new backup codes" />
            <ScreenHeader title="Backup codes" onBack={() => navigation.goBack()} />
            <ScrollView contentContainerClassName="px-5 pb-10" keyboardShouldPersistTaps="handled">
                {!codes ? (
                    <>
                        <Text className="text-base leading-6 mb-5" style={{ color: COLORS.muted }}>
                            Backup codes let you sign in if you lose your phone. You get ten; each works once. Making new ones
                            cancels any you made before. Enter the code your authenticator app shows now.
                        </Text>
                        <CodeInput value={code} onChangeText={setCode} tone="light" />
                        {error && (
                            <View className="mt-4">
                                <ErrorBanner error={error} onDismiss={() => setError(null)} />
                            </View>
                        )}
                        <View className="mt-6">
                            <PrimaryButton label="Make new backup codes" onPress={make} loading={loading} disabled={code.length !== 6} />
                        </View>
                    </>
                ) : (
                    <>
                        <Text className="text-base leading-6 mb-4" style={{ color: COLORS.disease }}>
                            Write these down or save them somewhere safe now. They won't be shown again.
                        </Text>
                        <View className="rounded-2xl p-4 flex-row flex-wrap" style={{ backgroundColor: COLORS.surface }}>
                            {codes.map((c) => (
                                <Text key={c} className="w-1/2 text-lg font-bold py-1.5 text-center" style={{ color: COLORS.ink, letterSpacing: 1 }}>
                                    {c}
                                </Text>
                            ))}
                        </View>
                        <View className="mt-6">
                            <PrimaryButton label="Save or share them" icon="share-outline" onPress={share} />
                            <SecondaryButton label="I've saved them" onPress={() => navigation.goBack()} />
                        </View>
                    </>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
