import React, { useContext, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { doubtDiagnosis } from '../../api/DiagnosisService';
import { toFriendlyError } from '../../utils/errorMessages';
import { loadCounty, saveCounty } from '../../utils/farmerCounty';
import ScreenHeader from '../../components/ScreenHeader';
import ErrorBanner from '../../components/ErrorBanner';
import CountyPicker from '../../components/CountyPicker';
import { PrimaryButton } from '../../components/Buttons';
import { COLORS } from '../../constants/theme';

const AFFECTED = [['few', 'A few plants'], ['patch', 'A patch of the field'], ['most', 'Most of the field']];
const NOTE_LENGTH = 300;

function Tick({ checked, onPress, title, hint }) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            className="flex-row items-start py-2"
        >
            <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? COLORS.brand : COLORS.faint} />
            <View className="flex-1 ml-3">
                <Text className="text-base font-semibold" style={{ color: COLORS.ink }}>
                    {title}
                </Text>
                {hint && (
                    <Text className="text-sm mt-0.5 leading-5" style={{ color: COLORS.muted }}>
                        {hint}
                    </Text>
                )}
            </View>
        </TouchableOpacity>
    );
}

/**
 * "This doesn't match what I see" (t31, supervisor 24 Oct): a diagnosed result the farmer
 * doubts goes, with their consent, to an extension officer in their county, who looks at the
 * photo and replies in Your checks. Route params: diagnosisId, disease (the result's name).
 */
export default function DoubtScreen({ route, navigation }) {
    const { diagnosisId, disease } = route.params;
    const { userToken } = useContext(AuthContext);
    const [consent, setConsent] = useState(false);
    const [contact, setContact] = useState(false);
    const [affected, setAffected] = useState(null);
    const [county, setCounty] = useState(null);
    const [note, setNote] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        loadCounty().then((saved) => saved && setCounty(saved));
    }, []);

    const chooseCounty = (value) => {
        setCounty(value);
        saveCounty(value);
    };

    const send = async () => {
        setSending(true);
        setError(null);
        try {
            const result = await doubtDiagnosis({
                token: userToken,
                diagnosisId,
                allowContact: contact,
                county,
                affected,
                note,
            });
            // Back to the result, which now shows that it was sent.
            navigation.popTo('Result', { ...route.params.resultParams, sentResult: result });
        } catch (e) {
            setError(toFriendlyError(e));
            setSending(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title="Doesn't match" onBack={() => navigation.goBack()} />
            <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
                <ScrollView contentContainerClassName="px-5 pb-6" keyboardShouldPersistTaps="handled">
                    <Text className="text-2xl font-bold" style={{ color: COLORS.ink }}>
                        This doesn't match what I see
                    </Text>
                    <Text className="text-base leading-6 mt-2" style={{ color: COLORS.text }}>
                        Sproutly said <Text className="font-bold">{disease}</Text>. An extension officer in your county
                        can look at your photo and reply in Your checks, usually within 7 days. Until then, don't spray
                        anything new.
                    </Text>

                    <View className="mt-5">
                        <Tick
                            checked={consent}
                            onPress={() => setConsent((on) => !on)}
                            title="Send my photo to an extension officer in my county"
                            hint="Needed to send it. Only that county's officers see it."
                        />
                        <Tick
                            checked={contact}
                            onPress={() => setContact((on) => !on)}
                            title="The officer may phone me"
                            hint="Your number is shared with that officer only."
                        />
                    </View>

                    <Text className="text-base font-semibold mt-4" style={{ color: COLORS.ink }}>
                        How much of your crop is affected?
                    </Text>
                    <View className="flex-row flex-wrap mt-2">
                        {AFFECTED.map(([value, label]) => (
                            <TouchableOpacity
                                key={value}
                                onPress={() => setAffected((current) => (current === value ? null : value))}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: affected === value }}
                                className="mr-2 mb-2 px-4 py-2 rounded-full"
                                style={{
                                    borderWidth: 1,
                                    borderColor: affected === value ? COLORS.brand : COLORS.divider,
                                    backgroundColor: affected === value ? COLORS.brand : COLORS.surface,
                                }}
                            >
                                <Text className="text-sm font-semibold" style={{ color: affected === value ? '#FFFFFF' : COLORS.text }}>
                                    {label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <View className="mt-2">
                        <CountyPicker value={county} onChange={chooseCounty} />
                    </View>

                    <Text className="text-base font-semibold mt-4" style={{ color: COLORS.ink }}>
                        What do you see? <Text className="font-normal" style={{ color: COLORS.muted }}>(optional)</Text>
                    </Text>
                    <TextInput
                        className="mt-2 rounded-xl px-4 py-3 text-base"
                        style={{ backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.divider, color: COLORS.text, minHeight: 96 }}
                        placeholder="For example: the spots are yellow, not brown"
                        placeholderTextColor={COLORS.faint}
                        multiline
                        textAlignVertical="top"
                        maxLength={NOTE_LENGTH}
                        value={note}
                        onChangeText={setNote}
                    />
                </ScrollView>

                <View className="px-5 pt-3 pb-4" style={{ backgroundColor: COLORS.background, borderTopWidth: 1, borderTopColor: COLORS.divider }}>
                    {error && (
                        <View className="mb-3">
                            <ErrorBanner error={error} onDismiss={() => setError(null)} />
                        </View>
                    )}
                    <PrimaryButton
                        label="Send to an officer"
                        loadingLabel="Sending…"
                        onPress={send}
                        disabled={!consent || !county || sending}
                        loading={sending}
                    />
                    {(!consent || !county) && (
                        <Text className="text-sm text-center mt-2" style={{ color: COLORS.muted }}>
                            {!consent ? 'Tick the box to send your photo' : 'Choose your county'}
                        </Text>
                    )}
                </View>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
