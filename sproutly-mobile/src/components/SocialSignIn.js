import React, { useContext, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AuthContext } from '../context/AuthContext';
import { signInWith } from '../api/oauth';
import { toFriendlyError } from '../utils/errorMessages';
import ErrorBanner from './ErrorBanner';
import BusyOverlay from './BusyOverlay';

const PROVIDERS = {
    google: { label: 'Continue with Google', icon: 'logo-google' },
};

/**
 * "or" plus one button per sign-in option the backend has switched on, for the
 * dark login and sign-up screens. Shows nothing if none are available.
 * onSignedIn, if given, receives the tokens of a plain Google sign-in instead of logging in
 * (sign-up uses it to add a password to a Google account once Google has confirmed who it is).
 */
export default function SocialSignIn({ navigation, onSignedIn }) {
    const { login } = useContext(AuthContext);
    // Google is switched on wherever Sproutly runs, so the button is part of the page from the
    // first frame. (It used to wait for the backend to list the options, and popped in late.)
    // A server without Google answers "Unknown sign-in option", shown as a clear message.
    const providers = Object.keys(PROVIDERS);
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState(null);

    const start = async (provider) => {
        setBusy(provider);
        setError(null);
        try {
            const result = await signInWith(provider);
            if (!result) return; // closed or cancelled: nothing to report
            if (result.link) {
                // This email already has a password account: prove it's yours to join Google to it.
                navigation.navigate('LinkGoogle', {
                    linkToken: result.link.link_token,
                    email: result.link.email,
                    needsCode: result.link.needs_code,
                });
                return;
            }
            if (result.challenge) {
                // A password account: Google stands in for the password, the authenticator is still asked
                // (or set up, if sign-up stopped before it).
                const c = result.challenge;
                navigation.navigate(c.next_step === 'setup' ? 'MfaSetup' : 'MfaCode', {
                    mfaToken: c.mfa_token,
                    expiresInMinutes: c.expires_in_minutes,
                    setup: c.setup,
                });
                return;
            }
            const { tokens } = result;
            if (onSignedIn) {
                await onSignedIn(tokens);
                return;
            }
            await login(tokens.access_token, [tokens.role], tokens.refresh_token);
        } catch (e) {
            setError(toFriendlyError(e));
        } finally {
            setBusy(null);
        }
    };

    return (
        <View>
            <BusyOverlay visible={busy !== null} message="Signing you in with Google" />
            <View className="flex-row items-center my-6">
                <View className="flex-1 h-px bg-white/20" />
                <Text className="mx-4 text-white/40 text-sm">or</Text>
                <View className="flex-1 h-px bg-white/20" />
            </View>

            {providers.map((provider) => (
                <TouchableOpacity
                    key={provider}
                    onPress={() => start(provider)}
                    disabled={busy !== null}
                    accessibilityRole="button"
                    className={`border border-white/20 py-4 rounded-2xl items-center flex-row justify-center mb-3 ${busy && busy !== provider ? 'opacity-50' : ''}`}
                >
                    {busy === provider ? (
                        <ActivityIndicator color="#FFFFFF" />
                    ) : (
                        <>
                            <Ionicons name={PROVIDERS[provider].icon} size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                            <Text className="text-white text-base font-semibold">{PROVIDERS[provider].label}</Text>
                        </>
                    )}
                </TouchableOpacity>
            ))}

            {/* Google can't tell us a phone number, so it can't find a phone account. */}
            <Text className="text-white/50 text-xs text-center mb-2">
                Signed up with your phone number? Use Phone above instead.
            </Text>

            {error && (
                <View className="mt-1">
                    <ErrorBanner error={error} tone="dark" onDismiss={() => setError(null)} />
                </View>
            )}
        </View>
    );
}
