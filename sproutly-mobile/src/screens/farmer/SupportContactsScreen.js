import React, { useCallback, useContext, useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../../context/AuthContext';
import { fetchContacts } from '../../api/ContactsService';
import { toFriendlyError } from '../../utils/errorMessages';
import { loadCounty, saveCounty } from '../../utils/farmerCounty';
import ErrorBanner from '../../components/ErrorBanner';
import ScreenHeader from '../../components/ScreenHeader';
import CountyPicker from '../../components/CountyPicker';
import BottomBar from '../../components/BottomBar';
import { COLORS } from '../../constants/theme';

const KIND_LABELS = { office: 'Extension office', clinic: 'Plant clinic', agrovet: 'Agrovet', hotline: 'Hotline' };
const PHONE_LABELS = { office: 'Office line', hotline: 'Hotline', business: 'Business line', personal: 'Mobile' };

function Contact({ item }) {
    const call = () => Linking.openURL(`tel:${item.phone.replace(/\s/g, '')}`);
    return (
        <View className="py-4" style={{ borderBottomWidth: 1, borderBottomColor: COLORS.divider }}>
            <Text className="text-xs font-bold tracking-wider" style={{ color: COLORS.brand }}>
                {(KIND_LABELS[item.kind] || item.kind).toUpperCase()}
            </Text>
            <Text className="text-base font-bold mt-1" style={{ color: COLORS.ink }}>
                {item.name}
            </Text>
            <Text className="text-sm mt-0.5" style={{ color: COLORS.muted }}>
                {item.role}, {item.organisation}
            </Text>
            <Text className="text-sm mt-0.5" style={{ color: COLORS.muted }}>
                {item.hours}
            </Text>
            <TouchableOpacity
                onPress={call}
                accessibilityRole="button"
                accessibilityLabel={`Call ${item.name}`}
                className="flex-row items-center self-start mt-3 px-4 py-2 rounded-full"
                style={{ backgroundColor: COLORS.brand }}
            >
                <Ionicons name="call-outline" size={16} color="#FFFFFF" />
                <Text className="text-white text-sm font-bold ml-2">{item.phone}</Text>
            </TouchableOpacity>
            <Text className="text-xs mt-1" style={{ color: COLORS.faint }}>
                {PHONE_LABELS[item.phone_type] || 'Office line'}
            </Text>
        </View>
    );
}

// The county contacts an administrator keeps up to date in the admin portal.
// Opened as a tab (bottom bar, no back arrow) or from a result screen (back arrow).
export default function SupportContactsScreen({ navigation, route }) {
    const asTab = Boolean(route?.params?.tab);
    const { userToken } = useContext(AuthContext);
    const [county, setCounty] = useState(null);
    const [contacts, setContacts] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(
        async (forCounty) => {
            setError(null);
            setLoading(true);
            try {
                setContacts(await fetchContacts({ token: userToken, county: forCounty }));
            } catch (e) {
                setError(toFriendlyError(e));
            } finally {
                setLoading(false);
            }
        },
        [userToken]
    );

    useEffect(() => {
        loadCounty().then((saved) => {
            setCounty(saved);
            if (saved) load(saved);
            else setLoading(false);
        });
    }, [load]);

    const chooseCounty = (value) => {
        setCounty(value);
        saveCounty(value);
        load(value);
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }} edges={asTab ? ['top'] : undefined}>
            <StatusBar style="dark" />
            <ScreenHeader title="Support Contacts" onBack={asTab ? undefined : () => navigation.goBack()} />
            <ScrollView contentContainerClassName="px-5 pb-10">
                <Text className="text-base mb-3 leading-6" style={{ color: COLORS.muted }}>
                    People who can look at your crop in person. Call before you treat if you are not sure.
                </Text>
                <CountyPicker value={county} onChange={chooseCounty} />

                {loading ? (
                    <View className="py-10 items-center">
                        <ActivityIndicator color={COLORS.brand} />
                    </View>
                ) : error ? (
                    <View className="mt-4">
                        <ErrorBanner error={error} onRetry={() => load(county)} />
                    </View>
                ) : !county ? (
                    <Text className="text-base mt-6 leading-6" style={{ color: COLORS.muted }}>
                        Choose your county to see its contacts.
                    </Text>
                ) : contacts?.length ? (
                    <View className="mt-2">
                        {contacts.map((item) => (
                            <Contact key={item.id} item={item} />
                        ))}
                    </View>
                ) : (
                    <Text className="text-base mt-6 leading-6" style={{ color: COLORS.muted }}>
                        No contacts are listed for {county} yet. Visit your county agriculture office or a local agrovet.
                    </Text>
                )}
            </ScrollView>
            {asTab && <BottomBar navigation={navigation} active="SupportContacts" />}
        </SafeAreaView>
    );
}
