import React from 'react';
import { Modal, View, Text, TouchableOpacity, Switch, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

/** A button above a list that shows the filter's current choice, e.g. "Crop: Tomato". */
export function FilterButton({ label, value, active, onPress }) {
    return (
        <TouchableOpacity
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel={`${label}: ${value}. Change`}
            className="flex-row items-center rounded-full pl-4 pr-3 py-2 mr-2"
            style={{
                backgroundColor: active ? '#E3F0E7' : COLORS.surface,
                borderWidth: 1,
                borderColor: active ? COLORS.brand : COLORS.divider,
            }}
        >
            <Text className="text-sm" style={{ color: COLORS.muted }}>
                {label}:{' '}
            </Text>
            <Text className="text-sm font-semibold" style={{ color: active ? COLORS.brand : COLORS.text }}>
                {value}
            </Text>
            <Ionicons name="chevron-down" size={16} color={active ? COLORS.brand : COLORS.muted} style={{ marginLeft: 4 }} />
        </TouchableOpacity>
    );
}

/**
 * A sheet from the bottom with one choice from a short list, and optionally a switch under it.
 * It closes with Done or the phone's back button.
 */
export default function FilterSheet({ visible, title, options, value, onChange, toggle, onClose }) {
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <View className="flex-1 justify-end" style={{ backgroundColor: 'rgba(11,26,19,0.35)' }}>
                <SafeAreaView edges={['bottom']} className="rounded-t-2xl px-5 pt-5 pb-3" style={{ backgroundColor: COLORS.surface }}>
                    <Text className="text-lg font-bold mb-2" style={{ color: COLORS.ink }}>
                        {title}
                    </Text>
                    <View accessibilityRole="radiogroup">
                        {options.map((option) => {
                            const selected = option.id === value;
                            return (
                                <Pressable
                                    key={option.id}
                                    onPress={() => onChange(option.id)}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected }}
                                    className="flex-row items-center py-3.5"
                                    style={{ borderBottomWidth: 1, borderBottomColor: COLORS.divider }}
                                >
                                    <Text className="flex-1 text-base" style={{ color: COLORS.text, fontWeight: selected ? '700' : '400' }}>
                                        {option.label}
                                    </Text>
                                    <Ionicons
                                        name={selected ? 'radio-button-on' : 'radio-button-off'}
                                        size={22}
                                        color={selected ? COLORS.brand : COLORS.faint}
                                    />
                                </Pressable>
                            );
                        })}
                    </View>
                    {toggle && (
                        <View className="flex-row items-center py-3.5">
                            <Text className="flex-1 text-base pr-3" style={{ color: COLORS.text }}>
                                {toggle.label}
                            </Text>
                            <Switch value={toggle.value} onValueChange={toggle.onChange} trackColor={{ true: COLORS.brand }}
                                    accessibilityLabel={toggle.label} />
                        </View>
                    )}
                    <TouchableOpacity
                        onPress={onClose}
                        accessibilityRole="button"
                        className="mt-3 items-center rounded-xl py-3.5"
                        style={{ backgroundColor: COLORS.brand }}
                    >
                        <Text className="text-base font-bold" style={{ color: '#FFFFFF' }}>
                            Done
                        </Text>
                    </TouchableOpacity>
                </SafeAreaView>
            </View>
        </Modal>
    );
}
