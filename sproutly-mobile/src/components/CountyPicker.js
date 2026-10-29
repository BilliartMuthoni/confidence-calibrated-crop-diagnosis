import React, { useContext, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import ScreenHeader from './ScreenHeader';
import BusyOverlay from './BusyOverlay';
import { AuthContext } from '../context/AuthContext';
import { locateCounty } from '../api/AuthService';
import { COUNTIES } from '../constants/counties';
import { COLORS } from '../constants/theme';

/**
 * A field showing the chosen county; tapping it opens a searchable list of the 47 counties.
 * "Use my location" finds it instead: the phone's position is sent once to the backend, which
 * checks it against the official county outlines and keeps nothing. If the farmer says no, or
 * is outside Kenya, they choose from the list as before.
 */
export default function CountyPicker({ value, onChange }) {
    const { userToken } = useContext(AuthContext);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [locating, setLocating] = useState(false);
    const [note, setNote] = useState(null); // what happened after "Use my location"
    const shown = COUNTIES.filter((c) => c.toLowerCase().includes(search.trim().toLowerCase()));

    const choose = (county) => {
        onChange(county);
        setOpen(false);
        setSearch('');
        setNote(null);
    };

    const findFromLocation = async () => {
        setNote(null);
        const permission = await Location.requestForegroundPermissionsAsync();
        if (!permission.granted) {
            setNote('Location is off for Sproutly. Choose your county from the list.');
            return;
        }
        setLocating(true);
        try {
            const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const { county } = await locateCounty({ token: userToken, latitude: coords.latitude, longitude: coords.longitude });
            if (county) {
                onChange(county);
                setNote(`Found from your location: ${county}.`);
            } else {
                setNote("You don't seem to be in Kenya. Choose your county from the list.");
            }
        } catch {
            setNote("Couldn't find your location. Choose your county from the list.");
        } finally {
            setLocating(false);
        }
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

            <TouchableOpacity
                onPress={findFromLocation}
                disabled={locating}
                accessibilityRole="button"
                accessibilityHint="Your location is used once to find your county and is not kept"
                className="flex-row items-center self-start mt-2.5 py-1"
            >
                <Text className="ml-1.5 text-sm font-bold" style={{ color: COLORS.brand }}>
                    Use my location
                </Text>
            </TouchableOpacity>
            <Text className="text-xs mt-0.5 leading-4" style={{ color: COLORS.muted }}>
                {note || 'Used once to find your county. Your location is not kept.'}
            </Text>
            <BusyOverlay visible={locating} message="Finding your county" />

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
