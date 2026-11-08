import React, { useContext, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import ScreenHeader from '../../components/ScreenHeader';
import { COLORS } from '../../constants/theme';
import { APP_VERSION, CONTACT_EMAIL, PAGES } from '../../constants/accountText';
import { fetchServerVersion } from '../../api/DiagnosisService';
import { acceptTerms } from '../../api/AuthService';
import { AuthContext } from '../../context/AuthContext';

const TABS = [['terms', 'Terms of use'], ['privacy', 'Privacy policy']];

/**
 * Privacy policy, terms of use, help and about: plain reading pages (text in constants/accountText.js).
 * Opened with agree: 'home' (the Home pop-up) or 'signup' (the sign-up tick-box), it shows the Terms
 * and the Privacy policy as two tabs, with "I agree to both" and Back at the bottom (t50).
 */
export default function InfoScreen({ route, navigation }) {
    const { userToken } = useContext(AuthContext);
    const agree = route.params.agree;
    const [tab, setTab] = useState(route.params.page);
    const page = PAGES[tab];
    const about = tab === 'about';
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState(null);
    // The About page also says which model the server runs, so a result can be traced to it.
    const [server, setServer] = useState(null);
    useEffect(() => {
        if (about) fetchServerVersion().then(setServer);
    }, [about]);

    const agreeToBoth = async () => {
        if (agree === 'signup') {
            // Back to the form with the box ticked; the agreement is saved with the sign-up.
            navigation.popTo('SignUp', { agreed: true });
            return;
        }
        setSaving(true);
        setSaveError(null);
        try {
            await acceptTerms({ token: userToken });
            navigation.goBack(); // Home checks again on focus and no longer asks.
        } catch {
            setSaveError('Could not save. Check your connection and try again.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title={agree ? 'Terms and privacy' : page.title} onBack={() => navigation.goBack()} />
            {agree && (
                <View className="flex-row mx-5 mb-2 p-1 rounded-xl" style={{ backgroundColor: COLORS.divider }}>
                    {TABS.map(([key, label]) => (
                        <TouchableOpacity
                            key={key}
                            onPress={() => setTab(key)}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: tab === key }}
                            className="flex-1 py-2.5 items-center rounded-lg"
                            style={{ backgroundColor: tab === key ? COLORS.surface : 'transparent' }}
                        >
                            <Text className="text-base font-semibold" style={{ color: tab === key ? COLORS.brand : COLORS.muted }}>
                                {label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
            {/* key: a new tab starts at the top. */}
            <ScrollView key={tab} contentContainerClassName="px-5 pb-12">
                <Text className="text-base leading-6 mt-1" style={{ color: COLORS.muted }}>
                    {page.intro}
                </Text>
                {page.sections.map(([heading, lines]) => (
                    <View key={heading} className="mt-6">
                        <Text className="text-base font-bold mb-2" style={{ color: COLORS.ink }}>
                            {heading}
                        </Text>
                        {lines.map((line) => (
                            <View key={line} className="flex-row mb-2">
                                <Text className="text-base mr-2" style={{ color: COLORS.brand }}>
                                    •
                                </Text>
                                <Text className="text-base leading-6 flex-1" style={{ color: COLORS.text }}>
                                    {line}
                                </Text>
                            </View>
                        ))}
                    </View>
                ))}
                {CONTACT_EMAIL && tab === 'privacy' && (
                    <Text className="text-base leading-6 mt-6" style={{ color: COLORS.text }}>
                        Questions about your data: {CONTACT_EMAIL}
                    </Text>
                )}
                {about && (
                    <Text className="text-center text-xs mt-8" style={{ color: COLORS.faint }}>
                        Sproutly · version {APP_VERSION}
                    </Text>
                )}
                {about && server?.model_version && (
                    <Text className="text-center text-xs mt-2 leading-4" style={{ color: COLORS.faint }}>
                        Model: {server.model_version}
                        {server.model_revision && server.model_revision !== 'local'
                            ? ` · files ${server.model_revision.slice(0, 7)}`
                            : ''}
                    </Text>
                )}
            </ScrollView>
            {agree && (
                <View className="px-5 pt-3 pb-2" style={{ borderTopWidth: 1, borderTopColor: COLORS.divider, backgroundColor: COLORS.surface }}>
                    {saveError && (
                        <Text className="text-sm mb-2 text-center" style={{ color: COLORS.danger }}>
                            {saveError}
                        </Text>
                    )}
                    <TouchableOpacity
                        onPress={agreeToBoth}
                        disabled={saving}
                        accessibilityRole="button"
                        className="py-4 rounded-2xl items-center"
                        style={{ backgroundColor: COLORS.brand, opacity: saving ? 0.6 : 1 }}
                    >
                        {saving ? (
                            <ActivityIndicator color="#FFFFFF" />
                        ) : (
                            <Text className="text-white text-lg font-bold">I agree to both</Text>
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => navigation.goBack()} accessibilityRole="button" className="py-3 items-center">
                        <Text className="text-base font-semibold" style={{ color: COLORS.muted }}>
                            Back
                        </Text>
                    </TouchableOpacity>
                </View>
            )}
        </SafeAreaView>
    );
}
