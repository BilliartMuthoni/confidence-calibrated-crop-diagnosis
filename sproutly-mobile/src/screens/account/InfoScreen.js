import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import ScreenHeader from '../../components/ScreenHeader';
import { COLORS } from '../../constants/theme';
import { APP_VERSION, CONTACT_EMAIL, PAGES } from '../../constants/accountText';

/** Privacy policy, terms of use, help and about: plain reading pages (text in constants/accountText.js). */
export default function InfoScreen({ route, navigation }) {
    const page = PAGES[route.params.page];
    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            <StatusBar style="dark" />
            <ScreenHeader title={page.title} onBack={() => navigation.goBack()} />
            <ScrollView contentContainerClassName="px-5 pb-12">
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
                {CONTACT_EMAIL && route.params.page === 'privacy' && (
                    <Text className="text-base leading-6 mt-6" style={{ color: COLORS.text }}>
                        Questions about your data: {CONTACT_EMAIL}
                    </Text>
                )}
                {route.params.page === 'about' && (
                    <Text className="text-center text-xs mt-8" style={{ color: COLORS.faint }}>
                        Sproutly · version {APP_VERSION}
                    </Text>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
