import React, { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * Inline error display. Stays on screen so the person can read it at their own
 * pace, unlike an alert that has to be dismissed before they can act on it.
 * "Try again" is a real button, dismissing is a small close mark, and it fades in so it is
 * noticed without a jolt.
 *
 * `error` is the shape returned by toFriendlyError(): { title, message, retryable }
 */
export default function ErrorBanner({ error, onRetry, onDismiss, tone = 'light' }) {
    const opacity = useRef(new Animated.Value(0)).current;
    const lift = useRef(new Animated.Value(6)).current;

    useEffect(() => {
        if (!error) return;
        opacity.setValue(0);
        lift.setValue(6);
        Animated.parallel([
            Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
            Animated.timing(lift, { toValue: 0, duration: 180, useNativeDriver: true }),
        ]).start();
    }, [error, opacity, lift]);

    if (!error) return null;

    const isDark = tone === 'dark';
    const colors = isDark
        ? { box: 'rgba(255,255,255,0.10)', border: 'rgba(255,255,255,0.20)', title: '#FFFFFF', text: 'rgba(255,255,255,0.85)',
            button: '#FFFFFF', buttonText: '#1B4332' }
        : { box: '#FDF0EA', border: '#F0D3C3', title: '#7A3F17', text: '#7A3F17', button: '#A5571F', buttonText: '#FFFFFF' };
    const canRetry = Boolean(onRetry && error.retryable);

    return (
        <Animated.View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            className="rounded-2xl p-4"
            style={{ backgroundColor: colors.box, borderWidth: 1, borderColor: colors.border, opacity, transform: [{ translateY: lift }] }}
        >
            <Text className="text-[15px] font-bold leading-5 pr-6" style={{ color: colors.title }}>
                {error.title}
            </Text>
            <Text className="text-sm mt-1 leading-5" style={{ color: colors.text }}>
                {error.message}
            </Text>
            {canRetry && (
                <TouchableOpacity
                    onPress={onRetry}
                    accessibilityRole="button"
                    className="flex-row items-center self-start rounded-full px-3.5 py-2 mt-3"
                    style={{ backgroundColor: colors.button }}
                >
                    <Ionicons name="refresh" size={15} color={colors.buttonText} />
                    <Text className="text-sm font-bold ml-1.5" style={{ color: colors.buttonText }}>
                        Try again
                    </Text>
                </TouchableOpacity>
            )}
            {onDismiss && (
                <TouchableOpacity
                    onPress={onDismiss}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Dismiss"
                    className="absolute top-3 right-3 p-1"
                >
                    <Ionicons name="close" size={18} color={colors.text} />
                </TouchableOpacity>
            )}
        </Animated.View>
    );
}
