import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, Image, Linking, KeyboardAvoidingView, Keyboard, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import AssistantBox from '../../components/AssistantBox';
import ScreenHeader from '../../components/ScreenHeader';
import ErrorBanner from '../../components/ErrorBanner';
import { PrimaryButton, SecondaryButton, TextButton } from '../../components/Buttons';
import { AuthContext } from '../../context/AuthContext';
import { fetchDiagnosis, fetchDiagnosisPhoto } from '../../api/DiagnosisService';
import { toFriendlyError } from '../../utils/errorMessages';
import { markReplySeen } from '../../utils/seenReplies';
import { fullDateLabel, whenLabel } from '../../utils/time';
import { COLORS, CROP_LABELS } from '../../constants/theme';

/** A titled, numbered list separated from what comes before by a thin rule. */
function Steps({ title, items }) {
    if (!items?.length) return null;
    return (
        <View className="mt-6 pt-5" style={{ borderTopWidth: 1, borderTopColor: COLORS.divider }}>
            <Text className="text-base font-bold mb-3" style={{ color: COLORS.ink }}>
                {title}
            </Text>
            {items.map((step, index) => (
                <View key={index} className="flex-row mb-3">
                    <Text className="text-base font-bold w-6" style={{ color: COLORS.faint }}>
                        {index + 1}
                    </Text>
                    <Text className="text-base flex-1 leading-6" style={{ color: COLORS.text }}>
                        {step}
                    </Text>
                </View>
            ))}
        </View>
    );
}

/** The backend sends a source as "Title (licence): link"; the link part is optional. */
function splitSource(source) {
    const at = source.lastIndexOf(': http');
    return at > 0 ? { label: source.slice(0, at), url: source.slice(at + 2) } : { label: source, url: null };
}

/** One source's title and licence, opening the factsheet; showing it is the credit the licences ask for. */
function SourceLink({ source }) {
    const { label, url } = splitSource(source);
    return (
        <Text
            className="text-sm leading-5 mb-2"
            style={{ color: url ? COLORS.brand : COLORS.muted, textDecorationLine: url ? 'underline' : 'none' }}
            onPress={url ? () => Linking.openURL(url) : undefined}
            accessibilityRole={url ? 'link' : undefined}
        >
            {label}
        </Text>
    );
}

/** Where the advice comes from: each source's title and licence, opening the factsheet. */
function Sources({ items }) {
    if (!items?.length) return null;
    return (
        <View className="mt-6 pt-5" style={{ borderTopWidth: 1, borderTopColor: COLORS.divider }}>
            <Text className="text-sm font-bold mb-2" style={{ color: COLORS.muted }}>
                Where this advice comes from (tap a source to open it)
            </Text>
            {items.map((source) => (
                <SourceLink key={source} source={source} />
            ))}
        </View>
    );
}

/** A light blue note, used for everything about the county officer. */
function OfficerNote({ children }) {
    return (
        <View className="mt-4 rounded-xl px-4 py-3" style={{ backgroundColor: '#EAF1F8', borderWidth: 1, borderColor: '#C9DAEC' }}>
            {children}
        </View>
    );
}

/** The officer's reply as it was sent: their message, any advice they attached, who and when. */
function OfficerReply({ reply }) {
    const signed = [reply.officer, reply.replied_at && `replied ${whenLabel(reply.replied_at)}`].filter(Boolean).join(', ');
    return (
        <OfficerNote>
            <Text className="text-xs font-bold tracking-wider" style={{ color: COLORS.referral }}>
                ADVICE FROM A COUNTY OFFICER
            </Text>
            <Text className="text-base mt-2 leading-6" style={{ color: COLORS.text }}>
                {reply.text}
            </Text>
            {reply.advice?.map((item, index) => (
                <View key={index} className="mt-3">
                    <Text className="text-base leading-6" style={{ color: COLORS.text }}>
                        {item.text}
                    </Text>
                    <SourceLink source={item.source} />
                </View>
            ))}
            {signed ? (
                <Text className="text-xs mt-2" style={{ color: COLORS.faint }}>
                    {signed}
                </Text>
            ) : null}
        </OfficerNote>
    );
}

/** What happened after a check was not diagnosed: sent to an officer and waiting, no reply in
 *  time, or not shared (then the support message). The officer's reply itself is shown apart. */
function ReferralState({ result, past }) {
    const waiting = result.referral_status === 'new' || result.referral_status === 'in_review';
    if (past && waiting) {
        return (
            <OfficerNote>
                <Text className="text-base leading-6" style={{ color: COLORS.text }}>
                    <Text className="font-bold">
                        {result.referral_status === 'in_review' ? 'A county officer is looking at it.' : 'Waiting for a county officer.'}
                    </Text>{' '}
                    Their reply will appear here within 7 days of your check.
                </Text>
            </OfficerNote>
        );
    }
    if (past && result.referral_status === 'expired') {
        return (
            <Text className="text-base mt-3 leading-6" style={{ color: COLORS.text }}>
                No officer replied in time. Please use the support contacts below.
            </Text>
        );
    }
    if (result.sent_to_officer) {
        return (
            <OfficerNote>
                <Text className="text-base leading-6" style={{ color: COLORS.text }}>
                    <Text className="font-bold">Sent to an extension officer in your county.</Text> Their reply will
                    appear under Your checks within 7 days. If nobody replies, use the support contacts.
                </Text>
            </OfficerNote>
        );
    }
    return (
        <Text className="text-base mt-3 leading-6" style={{ color: COLORS.text }}>
            {result.referral_message}
        </Text>
    );
}

/**
 * A result, either straight after a check (route params: result, imageUri) or opened from the
 * home page or Your checks (route params: diagnosisId), when it is loaded with everything about
 * it: the photo while it is kept, what the farmer described, and the officer's reply.
 */
export default function ResultScreen({ route, navigation }) {
    const { diagnosisId, imageUri } = route.params;
    const past = Boolean(diagnosisId);
    const { userToken } = useContext(AuthContext);
    const [result, setResult] = useState(route.params.result || null);
    const [error, setError] = useState(null);

    const load = useCallback(async () => {
        setError(null);
        try {
            const data = await fetchDiagnosis({ token: userToken, diagnosisId });
            setResult(data);
            // Opening the reply counts as reading it: Home stops showing it as new.
            if (data.officer_reply) markReplySeen(diagnosisId);
        } catch (e) {
            setError(toFriendlyError(e));
        }
    }, [userToken, diagnosisId]);

    useEffect(() => {
        if (past) load();
    }, [past, load]);

    // A past check's photo is fetched like any other request (so an expired sign-in is renewed),
    // with a spinner meanwhile and a visible retry if it fails, never a silent blank space.
    const tokenRef = useRef(userToken);
    tokenRef.current = userToken;
    const wantsPhoto = past && Boolean(result?.photo_available);
    const [photo, setPhoto] = useState({ state: 'idle', uri: null });
    const loadPhoto = useCallback(async () => {
        setPhoto({ state: 'loading', uri: null });
        try {
            setPhoto({ state: 'ready', uri: await fetchDiagnosisPhoto({ token: tokenRef.current, diagnosisId }) });
        } catch {
            setPhoto({ state: 'failed', uri: null });
        }
    }, [diagnosisId]);
    useEffect(() => {
        if (wantsPhoto) loadPhoto();
    }, [wantsPhoto, loadPhoto]);

    // A new result goes back to the start; a past one back to the list it was opened from.
    const close = past ? () => navigation.goBack() : () => navigation.popToTop();
    const openSupport = () => navigation.navigate('SupportContacts');

    // The assistant's box is at the bottom: when its keyboard opens, or a reply arrives, scroll
    // so the box stays in view. Android draws apps edge to edge (Expo 57), so the screen is no
    // longer resized for the keyboard by the system and padding is used on both platforms.
    const scrollRef = useRef(null);
    const asking = useRef(false);
    const toBottom = () => scrollRef.current?.scrollToEnd({ animated: true });
    useEffect(() => {
        const shown = Keyboard.addListener('keyboardDidShow', () => asking.current && toBottom());
        const hidden = Keyboard.addListener('keyboardDidHide', () => (asking.current = false));
        return () => {
            shown.remove();
            hidden.remove();
        };
    }, []);

    if (!result) {
        return (
            <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
                <StatusBar style="dark" />
                <ScreenHeader title="Result" onBack={close} />
                {error ? (
                    <View className="px-5 mt-4">
                        <ErrorBanner error={error} onRetry={load} />
                    </View>
                ) : (
                    <View className="py-10 items-center">
                        <ActivityIndicator color={COLORS.brand} />
                    </View>
                )}
            </SafeAreaView>
        );
    }

    const referred = result.is_referred;
    const cropLabel = CROP_LABELS[result.crop] || result.crop;
    const crop = cropLabel.toLowerCase();
    const healthy = !referred && result.predicted_disease?.startsWith('Healthy');

    const accent = referred ? COLORS.referral : healthy ? COLORS.healthy : COLORS.disease;
    const status = referred ? 'Not diagnosed' : healthy ? 'No disease found' : 'Diagnosis';
    const title = referred ? "We couldn't diagnose this reliably" : result.predicted_disease;
    const photoUri = imageUri || (photo.state === 'ready' ? photo.uri : null);

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title="Result" icon={past ? 'arrow-back' : 'close'} onBack={close} />
            <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
            <ScrollView ref={scrollRef} contentContainerClassName="pb-10" keyboardShouldPersistTaps="handled">
                {photoUri ? (
                    <Image source={{ uri: photoUri }} className="w-full h-56" resizeMode="cover" accessibilityLabel="Your leaf photo" />
                ) : wantsPhoto && photo.state === 'failed' ? (
                    <View className="w-full h-56 items-center justify-center" style={{ backgroundColor: COLORS.surface }}>
                        <Text className="text-sm" style={{ color: COLORS.muted }}>
                            Couldn't load the photo.
                        </Text>
                        <Text className="text-sm font-bold mt-2" style={{ color: COLORS.brand }} onPress={loadPhoto} accessibilityRole="button">
                            Try again
                        </Text>
                    </View>
                ) : wantsPhoto ? (
                    <View className="w-full h-56 items-center justify-center" style={{ backgroundColor: COLORS.surface }}>
                        <ActivityIndicator color={COLORS.brand} />
                    </View>
                ) : null}

                <View className="px-5 pt-5">
                    {past && !result.photo_available && (
                        <Text className="text-sm mb-3 leading-5" style={{ color: COLORS.faint }}>
                            The photo is no longer kept: photos are deleted 30 days after a check.
                        </Text>
                    )}
                    <Text className="text-xs font-bold tracking-wider" style={{ color: accent }}>
                        {cropLabel.toUpperCase()} · {status.toUpperCase()}
                    </Text>
                    <Text className="text-2xl font-bold mt-1" style={{ color: COLORS.ink }}>
                        {title}
                    </Text>
                    {past && (
                        <Text className="text-sm mt-1" style={{ color: COLORS.faint }}>
                            {fullDateLabel(result.created_at)}
                        </Text>
                    )}

                    {result.symptoms_text ? (
                        <View
                            className="mt-4 rounded-xl px-4 py-3"
                            style={{ backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.divider }}
                        >
                            <Text className="text-xs font-bold tracking-wider" style={{ color: COLORS.muted }}>
                                WHAT YOU DESCRIBED
                            </Text>
                            <Text className="text-base mt-1 leading-6" style={{ color: COLORS.text }}>
                                {result.symptoms_text}
                            </Text>
                        </View>
                    ) : null}

                    {referred ? (
                        <>
                            {result.officer_reply ? (
                                <OfficerReply reply={result.officer_reply} />
                            ) : (
                                <ReferralState result={result} past={past} />
                            )}
                            {result.crop_mismatch && (
                                <Text className="text-base mt-3 leading-6" style={{ color: COLORS.text }}>
                                    We could not diagnose this as <Text className="font-bold">{crop}</Text>. If this is
                                    not a {crop} leaf, choose the correct crop and try again. If it is {crop}, use the
                                    support contacts below.
                                </Text>
                            )}
                            {!result.officer_reply && (
                                <View className="mt-6 pt-5" style={{ borderTopWidth: 1, borderTopColor: COLORS.divider }}>
                                    <Text className="text-base font-bold mb-2" style={{ color: COLORS.ink }}>
                                        Before you treat
                                    </Text>
                                    <Text className="text-base leading-6" style={{ color: COLORS.text }}>
                                        Avoid spraying anything until you have an answer. Treating the wrong problem
                                        costs money and can make the crop worse.
                                    </Text>
                                </View>
                            )}
                        </>
                    ) : (
                        <>
                            {result.guidance?.summary && (
                                <Text className="text-base mt-3 leading-6" style={{ color: COLORS.text }}>
                                    {result.guidance.summary}
                                </Text>
                            )}
                            <Steps title="What to do now" items={result.guidance?.treatment} />
                            {!healthy && result.guidance?.treatment?.length > 0 && (
                                // Sprays are never named or dosed in the app: a wrong diagnosis would become a wrong spray.
                                <Text className="text-base leading-6" style={{ color: COLORS.text }}>
                                    <Text className="font-bold">Before using any chemical:</Text> use a product registered
                                    for this disease, follow its label, and ask your agrovet or extension officer.
                                </Text>
                            )}
                            <Steps title="Stopping it coming back" items={result.guidance?.prevention} />
                            <Sources items={result.guidance?.sources} />
                            <AssistantBox
                                diagnosisId={result.diagnosis_id}
                                saved={result.questions}
                                onSupport={openSupport}
                                onFocus={() => {
                                    asking.current = true;
                                    toBottom();
                                }}
                                onReply={() => setTimeout(toBottom, 100)}
                            />
                        </>
                    )}
                </View>

                <View className="px-5 mt-8">
                    {referred ? (
                        <>
                            <PrimaryButton
                                label="Support contacts"
                                icon="call-outline"
                                color={COLORS.referral}
                                onPress={openSupport}
                            />
                            {result.crop_mismatch && !past && (
                                // The diagnose screen still holds the photo, so going back is all a retry needs.
                                <SecondaryButton label="Choose a different crop" onPress={() => navigation.goBack()} />
                            )}
                            <TextButton label={past ? 'Back' : 'Back to home'} onPress={close} />
                        </>
                    ) : (
                        <>
                            <PrimaryButton label="Done" onPress={close} />
                            <Text className="text-sm text-center mt-4 leading-5" style={{ color: COLORS.muted }}>
                                Not matching what you see?{' '}
                                <Text className="font-bold" style={{ color: COLORS.brand }} onPress={openSupport}>
                                    Support contacts
                                </Text>
                            </Text>
                        </>
                    )}
                </View>
            </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}
