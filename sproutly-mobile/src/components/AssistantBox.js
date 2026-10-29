import React, { useContext, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { askAssistant } from '../api/DiagnosisService';
import { fetchCurrentUser, setKeepQuestions } from '../api/AuthService';
import { toFriendlyError } from '../utils/errorMessages';
import { COLORS } from '../constants/theme';

const MAX_LENGTH = 300;

/** "Title (licence): link" from the backend, split so the title can open the link. */
function splitSource(source) {
    const at = source.lastIndexOf(': http');
    return at > 0 ? { label: source.slice(0, at), url: source.slice(at + 2) } : { label: source, url: null };
}

/** One reply. Everything shown is library advice or fixed wording from the backend. */
function Reply({ reply, onChoice, onSupport, busy }) {
    const toOfficer = reply.kind === 'officer' || reply.kind === 'unavailable' || reply.kind === 'out_of_scope';
    // One source line under the list, not a link under every line.
    const sources = [...new Set(reply.advice.map((item) => item.source))].map(splitSource);
    return (
        <View className="rounded-xl px-4 py-3 mb-3" style={{ backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.divider }}>
            <Text className="text-base font-bold leading-6" style={{ color: COLORS.ink }}>
                {reply.message}
            </Text>
            {reply.advice.map((item, index) => (
                <View key={index} className="flex-row mt-2">
                    <Text className="text-base font-bold w-6" style={{ color: COLORS.faint }}>
                        {index + 1}
                    </Text>
                    <Text className="text-base flex-1 leading-6" style={{ color: COLORS.text }}>
                        {item.text}
                    </Text>
                </View>
            ))}
            {sources.length > 0 && (
                <Text className="text-xs leading-4 mt-3" style={{ color: COLORS.muted }}>
                    {' Source (tap to open): '}
                    {sources.map((source, index) => (
                        <Text
                            key={source.label}
                            style={{
                                color: source.url ? COLORS.brand : COLORS.muted,
                                textDecorationLine: source.url ? 'underline' : 'none',
                            }}
                            onPress={source.url ? () => Linking.openURL(source.url) : undefined}
                            accessibilityRole={source.url ? 'link' : undefined}
                        >
                            {index > 0 ? '; ' : ''}
                            {source.label}
                        </Text>
                    ))}
                </Text>
            )}
            {reply.choices.length > 0 && (
                <View className="flex-row flex-wrap mt-3">
                    {reply.choices.map((choice) => (
                        <TouchableOpacity
                            key={choice}
                            onPress={() => onChoice(choice)}
                            disabled={busy}
                            accessibilityRole="button"
                            className="mr-2 mb-2 px-4 py-2 rounded-full"
                            style={{ borderWidth: 1, borderColor: COLORS.brand }}
                        >
                            <Text className="text-sm font-semibold" style={{ color: COLORS.brand }}>
                                {choice}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
            {toOfficer && (
                <Text className="text-sm font-bold mt-3" style={{ color: COLORS.brand }} onPress={onSupport} accessibilityRole="button">
                    Support contacts
                </Text>
            )}
        </View>
    );
}

/** Asked once per account, before the first question is kept: keep questions with the check? */
function KeepCard({ onChoose, busy }) {
    return (
        <View className="rounded-xl px-4 py-3 mb-3" style={{ backgroundColor: '#EAF1F8' }}>
            <Text className="text-base font-bold leading-6" style={{ color: COLORS.ink }}>
                Keep your questions with this check?
            </Text>
            <Text className="text-sm leading-5 mt-1" style={{ color: COLORS.text }}>
                Then you can read them again later in Your checks. Only you can see them. You can change this or
                delete them in Account, Privacy.
            </Text>
            <View className="flex-row mt-3">
                <TouchableOpacity
                    onPress={() => onChoose(true)}
                    disabled={busy}
                    accessibilityRole="button"
                    className="mr-2 px-4 py-2 rounded-full"
                    style={{ backgroundColor: COLORS.brand }}
                >
                    <Text className="text-sm font-semibold" style={{ color: '#FFFFFF' }}>
                        Keep them
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => onChoose(false)}
                    disabled={busy}
                    accessibilityRole="button"
                    className="px-4 py-2 rounded-full"
                    style={{ borderWidth: 1, borderColor: COLORS.brand }}
                >
                    <Text className="text-sm font-semibold" style={{ color: COLORS.brand }}>
                        No thanks
                    </Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

/** "Ask about this result" (D9): the farmer's questions and the assistant's replies, starting
 *  with the ones kept earlier (saved, on a past result). onFocus and onReply let the screen
 *  scroll the box into view above the keyboard. */
export default function AssistantBox({ diagnosisId, saved, onSupport, onFocus, onReply }) {
    const { userToken } = useContext(AuthContext);
    const [turns, setTurns] = useState(() => (saved || []).map(({ question, reply }) => ({ question, reply })));
    const [question, setQuestion] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    // The farmer's choice about keeping questions: undefined while loading, null if not asked yet.
    const [keep, setKeep] = useState(undefined);
    const earlier = saved?.length || 0;

    useEffect(() => {
        let live = true;
        fetchCurrentUser({ token: userToken })
            .then((me) => live && setKeep(me.keep_questions ?? null))
            .catch(() => live && setKeep(false)); // not known: nothing is kept, and the card is not shown
        return () => {
            live = false;
        };
    }, [userToken]);

    const choose = async (value) => {
        setBusy(true);
        setError(null);
        try {
            await setKeepQuestions({ token: userToken, keep: value });
            setKeep(value);
        } catch (e) {
            setError(toFriendlyError(e).message);
        } finally {
            setBusy(false);
        }
    };

    const send = async (text) => {
        const asked = text.trim();
        if (!asked || busy) return;
        setBusy(true);
        setError(null);
        // What the farmer saw before, so a reply to the assistant's question makes sense
        // (the backend takes the last 12 lines).
        const history = turns
            .flatMap(({ question: q, reply }) => [
                { role: 'farmer', text: q },
                { role: 'assistant', text: [reply.message, ...reply.advice.map((a) => a.text)].join(' ').slice(0, 500) },
            ])
            .slice(-12);
        try {
            const reply = await askAssistant({ token: userToken, diagnosisId, question: asked, history });
            setTurns((current) => [...current, { question: asked, reply }]);
            if (reply.keep_questions !== undefined) setKeep(reply.keep_questions);
            setQuestion('');
            onReply?.();
        } catch (e) {
            setError(toFriendlyError(e).message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <View className="mt-6 pt-5" style={{ borderTopWidth: 1, borderTopColor: COLORS.divider }}>
            <Text className="text-base font-bold" style={{ color: COLORS.ink }}>
                Ask about this result
            </Text>
            {/* Kept apart from the model's prediction above (supervisor's tool-calling notes). */}
            <Text className="text-xs font-bold tracking-wider mt-1" style={{ color: COLORS.muted }}>
                TOOL-ASSISTED NEXT-STEP GUIDANCE
            </Text>
            <Text className="text-sm leading-5 mt-2 mb-3" style={{ color: COLORS.muted }}>
                Answers come only from the sourced advice for this result. For sprays and doses, ask your agrovet or
                extension officer. Your question is sent to an AI service (Groq) to choose the answer; Groq does not
                keep it. Sproutly keeps it only if you agree.
            </Text>

            {keep === null && <KeepCard onChoose={choose} busy={busy} />}

            {turns.map(({ question: q, reply }, index) => (
                <View key={index}>
                    {earlier > 0 && index === 0 && (
                        <Text className="text-xs font-bold tracking-wider mb-2" style={{ color: COLORS.muted }}>
                            YOUR EARLIER QUESTIONS
                        </Text>
                    )}
                    <View className="self-end rounded-xl px-4 py-2 mb-2 max-w-[85%]" style={{ backgroundColor: COLORS.brand }}>
                        <Text className="text-base leading-6" style={{ color: '#FFFFFF' }}>
                            {q}
                        </Text>
                    </View>
                    <Reply reply={reply} onChoice={send} onSupport={onSupport} busy={busy} />
                </View>
            ))}

            {error && (
                <Text className="text-sm leading-5 mb-2" style={{ color: COLORS.disease }}>
                    {error}
                </Text>
            )}

            <View className="flex-row items-end">
                {/* Wraps onto new lines (up to about 4) so the whole question stays visible. */}
                <TextInput
                    className="flex-1 rounded-xl px-4 py-3 text-base"
                    style={{
                        backgroundColor: COLORS.surface,
                        borderWidth: 1,
                        borderColor: COLORS.divider,
                        color: COLORS.text,
                        maxHeight: 120,
                        textAlignVertical: 'top',
                    }}
                    placeholder="e.g. How do I stop it coming back?"
                    placeholderTextColor={COLORS.faint}
                    value={question}
                    onChangeText={setQuestion}
                    onFocus={onFocus}
                    maxLength={MAX_LENGTH}
                    editable={!busy}
                    multiline
                    accessibilityLabel="Your question about this result"
                />
                <TouchableOpacity
                    onPress={() => send(question)}
                    disabled={busy || !question.trim()}
                    accessibilityRole="button"
                    accessibilityLabel="Send question"
                    className="ml-2 w-12 h-12 rounded-full items-center justify-center"
                    style={{ backgroundColor: busy || !question.trim() ? COLORS.faint : COLORS.brand }}
                >
                    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="send" size={20} color="#FFFFFF" />}
                </TouchableOpacity>
            </View>
            {(keep === true || keep === false) && (
                <Text className="text-xs leading-4 mt-2" style={{ color: COLORS.faint }}>
                    {keep
                        ? 'Your questions are kept with this check. Change this in Account, Privacy.'
                        : 'Your questions are not kept. Change this in Account, Privacy.'}
                </Text>
            )}
        </View>
    );
}
