import React from 'react';
import { View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

/** Shown above data loaded from the phone's saved copy because there is no signal (g07). */
export default function SavedCopyNote({ what = 'this' }) {
    return (
        <View className="flex-row items-start mt-2 mb-1">
            <Ionicons name="cloud-offline-outline" size={16} color={COLORS.muted} style={{ marginTop: 2 }} />
            <Text className="flex-1 ml-2 text-sm leading-5" style={{ color: COLORS.muted }}>
                No signal: showing {what} as last saved on this phone. It may be out of date.
            </Text>
        </View>
    );
}
