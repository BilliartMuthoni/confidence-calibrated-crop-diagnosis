import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, CROP_LABELS } from '../constants/theme';
import { whenLabel } from '../utils/time';

/** What happened to a check, in a few words and its colour. */
export function outcome(item) {
    if (item.officer_response) return { text: 'Officer replied. Tap to read', color: COLORS.referral, kind: 'officer' };
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

/** One check in the history; a check with an officer's reply opens to show it. */
export default function CheckRow({ item, first, open, onToggle }) {
    const result = outcome(item);
    const hasReply = Boolean(item.officer_response);
    return (
        <View style={{ borderTopWidth: first ? 0 : 1, borderTopColor: COLORS.divider }}>
            <TouchableOpacity
                disabled={!hasReply}
                onPress={onToggle}
                activeOpacity={0.7}
                accessibilityRole={hasReply ? 'button' : undefined}
                accessibilityState={hasReply ? { expanded: open } : undefined}
                className="flex-row items-center py-4"
            >
                <View className="w-2.5 h-2.5 rounded-full mr-4" style={{ backgroundColor: result.color }} />
                <View className="flex-1">
                    <Text className="text-base font-semibold" style={{ color: COLORS.ink }}>
                        {CROP_LABELS[item.crop] || item.crop}
                    </Text>
                    <Text className="text-sm mt-0.5" style={{ color: result.color }}>
                        {open ? 'Officer replied' : result.text}
                    </Text>
                </View>
                <Text className="text-xs" style={{ color: COLORS.faint }}>
                    {whenLabel(item.created_at)}
                </Text>
                {hasReply && (
                    <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.faint} style={{ marginLeft: 6 }} />
                )}
            </TouchableOpacity>
            {open && (
                <View
                    className="mb-4 rounded-xl px-4 py-3"
                    style={{ backgroundColor: '#EAF1F8', borderWidth: 1, borderColor: '#C9DAEC' }}
                >
                    <Text className="text-xs font-bold tracking-wider" style={{ color: COLORS.referral }}>
                        ADVICE FROM A COUNTY OFFICER
                    </Text>
                    <Text className="text-base mt-2 leading-6" style={{ color: COLORS.text }}>
                        {item.officer_response}
                    </Text>
                    {item.responded_at && (
                        <Text className="text-xs mt-2" style={{ color: COLORS.faint }}>
                            Replied {whenLabel(item.responded_at)}
                        </Text>
                    )}
                </View>
            )}
        </View>
    );
}
