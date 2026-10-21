import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

const groupStyle = { backgroundColor: COLORS.surface, borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.divider };

/** A titled group of rows, like the sections of a phone's settings. */
export function Group({ title, note, children }) {
    return (
        <View className="mt-7">
            {title && (
                <Text className="text-xs font-bold uppercase px-5 mb-2" style={{ color: COLORS.faint, letterSpacing: 0.6 }}>
                    {title}
                </Text>
            )}
            <View style={groupStyle}>{children}</View>
            {note && (
                <Text className="text-sm px-5 mt-2 leading-5" style={{ color: COLORS.muted }}>
                    {note}
                </Text>
            )}
        </View>
    );
}

const rowLine = (last) => (last ? null : { borderBottomWidth: 1, borderBottomColor: COLORS.divider });

/** A label and a value that can't be changed here. */
export function InfoRow({ label, value, last }) {
    return (
        <View className="flex-row items-center py-4 ml-5 pr-5" style={rowLine(last)}>
            <Text className="text-base flex-1" style={{ color: COLORS.muted }}>
                {label}
            </Text>
            <Text className="text-base font-semibold" style={{ color: COLORS.ink }}>
                {value}
            </Text>
        </View>
    );
}

/** A row that opens another screen. */
export function NavRow({ icon, label, hint, onPress, color = COLORS.ink, last }) {
    return (
        <TouchableOpacity
            onPress={onPress}
            accessibilityRole="button"
            className="flex-row items-center py-4 ml-5 pr-4"
            style={rowLine(last)}
        >
            <Ionicons name={icon} size={20} color={color === COLORS.ink ? COLORS.brand : color} />
            <View className="flex-1 ml-3">
                <Text className="text-base" style={{ color }}>
                    {label}
                </Text>
                {hint && (
                    <Text className="text-sm mt-0.5" style={{ color: COLORS.faint }}>
                        {hint}
                    </Text>
                )}
            </View>
            <Ionicons name="chevron-forward" size={18} color={COLORS.faint} />
        </TouchableOpacity>
    );
}
