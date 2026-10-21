import 'react-native-gesture-handler';
import './global.css';
import React, { useContext } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { AuthContext, AuthProvider } from './src/context/AuthContext';

// Auth Screens
import LandingScreen from './src/screens/auth/LandingScreen';
import LoginScreen from './src/screens/auth/LoginScreen';
import SignUpScreen from './src/screens/auth/SignUpScreen';
import MfaSetupScreen from './src/screens/auth/MfaSetupScreen';
import MfaCodeScreen from './src/screens/auth/MfaCodeScreen';
import LinkGoogleScreen from './src/screens/auth/LinkGoogleScreen';

// Splash Screen
import SplashScreen from './src/screens/SplashScreen.js';

// Farmer Screens
import FarmerDashboard from './src/screens/farmer/FarmerDashboard';
import DiagnosisScreen from './src/screens/farmer/DiagnosisScreen';
import ResultScreen from './src/screens/farmer/ResultScreen';
import BatchResultScreen from './src/screens/farmer/BatchResultScreen';
import AccountScreen from './src/screens/account/AccountScreen';
import ChangePasswordScreen from './src/screens/account/ChangePasswordScreen';
import NewAuthenticatorScreen from './src/screens/account/NewAuthenticatorScreen';
import BackupCodesScreen from './src/screens/account/BackupCodesScreen';
import DeleteAccountScreen from './src/screens/account/DeleteAccountScreen';
import InfoScreen from './src/screens/account/InfoScreen';
import ConnectGoogleScreen from './src/screens/account/ConnectGoogleScreen';
import SupportContactsScreen from './src/screens/farmer/SupportContactsScreen';
import HistoryScreen from './src/screens/farmer/HistoryScreen';

const Stack = createStackNavigator();

const RootNavigator = () => {
    const { userToken, isLoading } = useContext(AuthContext);

    // While checking for a token in storage, show nothing (or a Splash Screen)
    if (isLoading) return <SplashScreen />;

    return (
        <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {userToken == null ? (
                    <>
                        {/*Authentication*/}
                        <Stack.Screen name="Landing" component={LandingScreen} />
                        <Stack.Screen name="Login" component={LoginScreen} />
                        <Stack.Screen name="SignUp" component={SignUpScreen} />
                        <Stack.Screen name="MfaSetup" component={MfaSetupScreen} />
                        <Stack.Screen name="MfaCode" component={MfaCodeScreen} />
                        <Stack.Screen name="LinkGoogle" component={LinkGoogleScreen} />
                    </>
                ) : (
                    <>
                        {/*Farmer*/}
                        {/* Home, History and Support switch through the bottom bar without a slide. */}
                        <Stack.Screen name="FarmerHome" component={FarmerDashboard} options={{ animation: 'none' }} />
                        <Stack.Screen name="History" component={HistoryScreen} options={{ animation: 'none' }} />
                        <Stack.Screen name="Diagnosis" component={DiagnosisScreen} />
                        <Stack.Screen name="Result" component={ResultScreen} />
                        <Stack.Screen name="BatchResult" component={BatchResultScreen} />
                        <Stack.Screen name="Account" component={AccountScreen} options={{ animation: 'none' }} />
                        <Stack.Screen name="ChangePassword" component={ChangePasswordScreen} />
                        <Stack.Screen name="NewAuthenticator" component={NewAuthenticatorScreen} />
                        <Stack.Screen name="BackupCodes" component={BackupCodesScreen} />
                        <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} />
                        <Stack.Screen name="Info" component={InfoScreen} />
                        <Stack.Screen name="ConnectGoogle" component={ConnectGoogleScreen} />
                        <Stack.Screen
                            name="SupportContacts"
                            component={SupportContactsScreen}
                            options={({ route }) => (route.params?.tab ? { animation: 'none' } : {})}
                        />
                    </>
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
};

export default function App() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <AuthProvider>
                <RootNavigator />
            </AuthProvider>
        </GestureHandlerRootView>
    );
}