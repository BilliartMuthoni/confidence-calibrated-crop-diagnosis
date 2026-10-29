import React from 'react';
import { Modal, View, Text, ActivityIndicator } from 'react-native';
import { COLORS } from '../constants/theme';

/**
 * Covers the whole screen while the app waits for the backend (a check being diagnosed, a sign-in,
 * a saved setting): a spinner and what is happening, and nothing behind it can be tapped, so a
 * farmer can't change the form or send the same photo twice. Android's back button waits too.
 */
export default function BusyOverlay({ visible, message, detail }) {
    return (
        <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
            <View
                className="flex-1 items-center justify-center px-8"
                style={{ backgroundColor: 'rgba(11,26,19,0.45)' }}
                accessibilityViewIsModal
            >
                <View
                    className="w-full items-center rounded-2xl px-6 py-7"
                    style={{ maxWidth: 320, backgroundColor: COLORS.surface }}
                    accessibilityLiveRegion="polite"
                    accessibilityRole="progressbar"
                    accessibilityLabel={message}
                >
                    <ActivityIndicator size="large" color={COLORS.brand} />
                    <Text className="text-base font-bold text-center mt-4" style={{ color: COLORS.ink }}>
                        {message}
                    </Text>
                    {detail && (
                        <Text className="text-sm text-center mt-1.5 leading-5" style={{ color: COLORS.muted }}>
                            {detail}
                        </Text>
                    )}
                </View>
            </View>
        </Modal>
    );
}
