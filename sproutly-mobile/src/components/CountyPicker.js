import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import ScreenHeader from './ScreenHeader';
import { COUNTIES } from '../constants/counties';
import { COLORS } from '../constants/theme';

/** A field showing the chosen county; tapping it opens a searchable list of the 47 counties. */
export default function CountyPicker({ value, onChange }) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const shown = COUNTIES.filter((c) => c.toLowerCase().includes(search.trim().toLowerCase()));

    const choose = (county) => {
        onChange(county);
        setOpen(false);
        setSearch('');
    };

    return (
        <>
            <TouchableOpacity
                onPress={() => setOpen(true)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={value ? `County: ${value}. Change` : 'Choose your county'}
                className="flex-row items-center rounded-xl px-4 py-3.5"
                style={{ backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.divider }}
            >
                <Ionicons name="location-outline" size={18} color={COLORS.brand} />
                <Text className="flex-1 ml-2 text-base" style={{ color: value ? COLORS.text : COLORS.faint }}>
                    {value || 'Choose your county'}
                </Text>
                <Ionicons name="chevron-down" size={18} color={COLORS.faint} />
            </TouchableOpacity>

            <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
                <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
                    <ScreenHeader title="Your county" icon="close" onBack={() => setOpen(false)} />
                    <View className="px-5 pb-2">
                        <TextInput
                            className="rounded-xl px-4 py-3 text-base"
                            style={{ backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.divider, color: COLORS.text }}
                            placeholder="Search"
                            placeholderTextColor={COLORS.faint}
                            value={search}
                            onChangeText={setSearch}
                            autoCorrect={false}
                        />
                    </View>
                    <FlatList
                        data={shown}
                        keyExtractor={(c) => c}
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                onPress={() => choose(item)}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: item === value }}
                                className="flex-row items-center py-4"
                                style={{ borderBottomWidth: 1, borderBottomColor: COLORS.divider }}
                            >
                                <Text className="flex-1 text-base" style={{ color: COLORS.text }}>
                                    {item}
                                </Text>
                                {item === value && <Ionicons name="checkmark" size={20} color={COLORS.brand} />}
                            </TouchableOpacity>
                        )}
                    />
                </SafeAreaView>
            </Modal>
        </>
    );
}
