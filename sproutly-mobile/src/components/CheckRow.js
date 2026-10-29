import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, CROP_LABELS } from '../constants/theme';
import { whenLabel } from '../utils/time';

/** What happened to a check, in a few words and its colour. */
export function outcome(item) {
    if (item.officer_response) return { text: 'Officer replied', color: COLORS.referral, kind: 'officer' };
    if (item.referral_status === 'new' || item.referral_status === 'in_review') {
        return { text: 'Waiting for a county officer', color: COLORS.referral, kind: 'officer' };
    }
    if (item.referral_status === 'expired') {
        return { text: 'No reply. Use support contacts', color: COLORS.referral, kind: 'referred' };
    }
    if (item.is_referred) return { text: 'Referred to support', color: COLORS.referral, kind: 'referred' };
    if (item.predicted_disease?.startsWith('Healthy')) return { text: 'Healthy', color: COLORS.healthy, kind: 'healthy' };
    // "Tomato Late Blight" -> "Late Blight": the crop is already shown above it.
    const disease = (item.predicted_disease || '').replace(/^(Maize|Tomato|Potato)\s+/, '');
    return { text: disease, color: COLORS.disease, kind: 'disease' };
}

/** One check in a list; tapping it opens the full result. An officer's reply gets a badge. */
export default function CheckRow({ item, first, onPress }) {
    const result = outcome(item);
    const replied = Boolean(item.officer_response);
    const crop = CROP_LABELS[item.crop] || item.crop;
    const when = whenLabel(item.created_at);
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${crop}, ${result.text}, ${when}. Open the full result`}
            className="flex-row items-center py-4"
            style={{ borderTopWidth: first ? 0 : 1, borderTopColor: COLORS.divider }}
        >
            <View className="w-2.5 h-2.5 rounded-full mr-4" style={{ backgroundColor: result.color }} />
            <View className="flex-1">
                <Text className="text-base font-semibold" style={{ color: COLORS.ink }}>
                    {crop}
                </Text>
                {replied ? (
                    <View className="flex-row mt-1">
                        <View className="flex-row items-center rounded-full px-2.5 py-0.5" style={{ backgroundColor: '#EAF1F8' }}>
                            <Ionicons name="chatbubble-ellipses" size={12} color={COLORS.referral} />
                            <Text className="text-xs font-bold ml-1" style={{ color: COLORS.referral }}>
                                Officer replied
                            </Text>
                        </View>
                    </View>
                ) : (
                    <Text className="text-sm mt-0.5" style={{ color: result.color }}>
                        {result.text}
                    </Text>
                )}
            </View>
            <Text className="text-xs" style={{ color: COLORS.faint }}>
                {when}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={COLORS.faint} style={{ marginLeft: 6 }} />
        </TouchableOpacity>
    );
}
