// Contains information needed by the whole app eg usertoken
import React, { createContext, useState, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { onSessionExpired } from '../api/session';
import {
    clearTokens,
    endSessionOnServer,
    expiresWithin,
    onTokensRenewed,
    readTokens,
    renewSession,
    saveTokens,
} from '../api/tokens';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [userToken, setUserToken] = useState(null);
    const [userRoles, setUserRoles] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    // Initial check: is this phone signed in? The access token is renewed here, BEFORE the
    // farmer screens appear, so the app no longer shows Home and then jumps to the login screen.
    useEffect(() => {
        const bootstrapAsync = async () => {
            try {
                let { access } = await readTokens();
                if (access && expiresWithin(access, 60)) {
                    try {
                        access = await renewSession(); // null: the session has ended
                    } catch {
                        // No signal: keep the saved token; requests renew it once there is a connection.
                    }
                }
                const roles = await AsyncStorage.getItem('userRoles');
                if (access) {
                    setUserToken(access);
                    if (roles) setUserRoles(JSON.parse(roles));
                } else {
                    await clearTokens();
                    await AsyncStorage.removeItem('userRoles');
                }
            } catch (e) {
                console.error("Failed to load auth data", e);
            }
            setIsLoading(false);
        };

        bootstrapAsync();
    }, []);

    // The Login Action
    const login = async (token, roles = [], refreshToken = null) => {
        try {
            await saveTokens(token, refreshToken);
            await AsyncStorage.setItem('userRoles', JSON.stringify(roles));

            setUserToken(token);
            setUserRoles(roles);

        } catch (e) {
            console.error("Failed to save auth data", e)
        }
    };

    // The Logout Action: the session ends on the server too, so the keys stop working everywhere.
    const logout = async () => {
        try {
            await endSessionOnServer();
            await clearTokens();
            await AsyncStorage.removeItem('userRoles');
            setUserToken(null);
            setUserRoles([]);
        } catch (e) {
            console.error("Failed to remove auth data", e);
        }
    };

    // When the backend rejects the stored token and renewing it fails too (expired session),
    // log out once and say why. RootNavigator then shows the login screens because userToken becomes null.
    const tokenRef = useRef(null);
    tokenRef.current = userToken;
    useEffect(() => {
        // A renewed token replaces the old one, so screens send the new one from now on.
        onTokensRenewed((token) => {
            if (tokenRef.current) setUserToken(token);
        });
        onSessionExpired(() => {
            if (!tokenRef.current) return; // several requests can fail at once; act only on the first
            tokenRef.current = null;
            logout();
            Alert.alert('Please log in again', 'Your session has ended for security. Log in to continue.');
        });
    }, []);

    return (
        <AuthContext.Provider value={{ login, logout, userToken, userRoles, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
};
