import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../constants/theme';

// The four places a farmer moves between. Account holds the profile and every setting
// (security, privacy, help, about), like the account page of other professional apps.
const TABS = [
    { name: 'FarmerHome', label: 'Home', icon: 'home' },
    { name: 'History', label: 'Your checks', icon: 'time' },
    { name: 'SupportContacts', label: 'Support', icon: 'call' },
    { name: 'Account', label: 'Account', icon: 'person-circle' },
];

/** Switches tabs without stacking screens: Home stays underneath, so Back always returns Home. */
export default function BottomBar({ navigation, active }) {
    const insets = useSafeAreaInsets();
    const go = (name) => {
        if (name === active) return;
        const routes = name === 'FarmerHome' ? [{ name }] : [{ name: 'FarmerHome' }, { name, params: { tab: true } }];
        navigation.reset({ index: routes.length - 1, routes });
    };

    return (
        <View
            className="flex-row"
            style={{
                backgroundColor: COLORS.surface,
                borderTopWidth: 1,
                borderTopColor: COLORS.divider,
                paddingBottom: Math.max(insets.bottom, 8),
            }}
            accessibilityRole="tablist"
        >
            {TABS.map((tab) => {
                const selected = tab.name === active;
                const color = selected ? COLORS.brand : COLORS.faint;
                return (
                    <TouchableOpacity
                        key={tab.name}
                        onPress={() => go(tab.name)}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        className="flex-1 items-center pt-2.5"
                    >
                        <Ionicons name={selected ? tab.icon : `${tab.icon}-outline`} size={22} color={color} />
                        <Text className="text-xs mt-1" style={{ color, fontWeight: selected ? '700' : '500' }}>
                            {tab.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}
