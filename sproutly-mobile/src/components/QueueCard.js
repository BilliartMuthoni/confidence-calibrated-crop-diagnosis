import React from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, CROP_LABELS } from '../constants/theme';
import { toFriendlyError } from '../utils/errorMessages';
import { whenLabel } from '../utils/time';

/**
 * Checks saved with no signal (g07), on Home: each waits to be sent by itself; one the server
 * refused (too blurred, not a leaf) shows why and can be removed. The same white card as the
 * Disease library card above it.
 */
export default function QueueCard({ items, busy, onTryNow, onRemove }) {
    if (!items.length) return null;
    const waiting = items.filter((i) => !i.error).length;
    return (
        <View className="mt-3 rounded-2xl px-5 py-4" style={{ backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.divider }}>
            <View className="flex-row items-center">
                <Ionicons name="cloud-upload-outline" size={22} color={COLORS.brand} />
                <Text className="flex-1 ml-3 text-base font-bold" style={{ color: COLORS.ink }}>
                    {waiting ? `Waiting for signal (${waiting})` : 'Could not be checked'}
                </Text>
                {busy && <ActivityIndicator color={COLORS.brand} />}
            </View>
            {waiting > 0 && (
                <Text className="text-sm mt-1 ml-9 leading-5" style={{ color: COLORS.muted }}>
                    {waiting === 1 ? 'It will be' : 'They will be'} sent and checked by itself when you have signal.
                </Text>
            )}
            {items.map((item) => {
                const crop = item.crop ? CROP_LABELS[item.crop] : 'Crop not chosen';
                const problem = item.error ? toFriendlyError(item.error) : null;
                return (
                    <View key={item.id} className="mt-3 ml-9">
                        <Text className="text-sm" style={{ color: COLORS.text }}>
                            {crop} photo · saved {whenLabel(item.savedAt)}
                        </Text>
                        {problem && (
                            <Text className="text-sm mt-0.5 leading-5" style={{ color: COLORS.disease }}>
                                {problem.title}: {problem.message}{' '}
                                <Text className="font-bold" style={{ color: COLORS.brand }} onPress={() => onRemove(item.id)} accessibilityRole="button">
                                    Remove
                                </Text>
                            </Text>
                        )}
                    </View>
                );
            })}
            {waiting > 0 && (
                <TouchableOpacity
                    onPress={onTryNow}
                    disabled={busy}
                    accessibilityRole="button"
                    className="flex-row items-center self-start mt-3 ml-9 px-3 py-1.5 rounded-full"
                    style={{ borderWidth: 1, borderColor: COLORS.brand }}
                >
                    <Text className="text-sm font-bold" style={{ color: COLORS.brand }}>
                        {busy ? 'Sending…' : 'Try now'}
                    </Text>
                </TouchableOpacity>
            )}
        </View>
    );
}
