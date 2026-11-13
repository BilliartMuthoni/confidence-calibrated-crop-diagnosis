import React from 'react';
import { View, Text, TouchableOpacity, Image, Dimensions, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

// What the app does, in farmers' words. Not buttons: kept quiet (no border) so they don't look tappable.
const FEATURES = [
    { icon: 'leaf', label: 'Diagnose' },
    { icon: 'book-open-variant', label: 'Get advice' },
    { icon: 'account-tie', label: 'Expert help' },
];

export default function LandingScreen({ navigation }) {
    return (
        <LinearGradient
            colors={['#0B1A13', '#1B3D2F', '#2D5A43']}
            style={{ flex: 1 }}
        >
            <StatusBar style="light" />
            <SafeAreaView style={{ flex: 1 }}>
                {/* Scrolls only on small phones, so the buttons are never pushed off the screen. */}
                <ScrollView contentContainerStyle={{ flexGrow: 1 }} bounces={false} showsVerticalScrollIndicator={false}>
                    <View className="flex-1 justify-between px-8 pt-14 pb-12">
                        {/* Logo, name and tagline at the top, the cards in the middle, the buttons at the bottom */}
                        <View className="items-center">
                            <Image
                                source={require('../../../assets/images/sproutly-logo.png')}
                                alt="Sproutly Logo"
                                className="w-48 h-48 -mb-1 -mt-2"
                                resizeMode="contain"
                            />
                            <Text className="text-4xl font-black text-white text-center tracking-wide">
                                Sproutly
                            </Text>
                            <Text className="text-base text-white text-center opacity-85 mt-2.5 px-5">
                                Crop disease diagnosis for Kenyan farmers
                            </Text>
                        </View>

                        <View className="flex-row justify-around my-8">
                            {FEATURES.map((feature) => (
                                <View
                                    key={feature.label}
                                    style={{ width: width * 0.26 }}
                                    className="items-center bg-white/5 py-4 px-2 rounded-2xl"
                                >
                                    <MaterialCommunityIcons
                                        name={feature.icon}
                                        size={30}
                                        color="#FFFFFF"
                                        style={{ marginBottom: 8 }}
                                    />
                                    <Text className="text-white text-xs font-semibold text-center opacity-90">
                                        {feature.label}
                                    </Text>
                                </View>
                            ))}
                        </View>

                        {/* Action Buttons */}
                        <View className="w-full">
                            <TouchableOpacity
                                className="bg-white py-[18px] rounded-2xl items-center mb-4 shadow-lg"
                                onPress={() => navigation.navigate('SignUp')}
                                activeOpacity={0.8}
                            >
                                <Text className="text-primary text-lg font-bold">Get Started</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                className="py-4 items-center"
                                onPress={() => navigation.navigate('Login')}
                                activeOpacity={0.8}
                            >
                                <Text className="text-white text-base font-semibold">
                                    Already have an account?{' '}
                                    <Text className="underline font-bold">Log in</Text>
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </ScrollView>
            </SafeAreaView>
        </LinearGradient>
    );
}
