import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { GothicA1_700Bold } from '@expo-google-fonts/gothic-a1';
import * as SplashScreen from 'expo-splash-screen';
import { Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { registerTranslation, en } from 'react-native-paper-dates';
import { colors } from '../src/theme/colors';

registerTranslation('en', en);

SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden or unavailable in some environments */
});

const isAndroid = Platform.OS === 'android';
const isIOS = Platform.OS === 'ios';

const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.primary,
    primaryContainer: 'rgba(30, 77, 48, 0.12)',
    onPrimary: colors.textLight,
    onPrimaryContainer: colors.primary,
    secondary: colors.secondary,
    secondaryContainer: 'rgba(180, 174, 232, 0.18)',
    surface: colors.neutral,
    surfaceVariant: colors.neutralLight,
    onSurface: colors.textDark,
    onSurfaceVariant: colors.textMuted,
    background: colors.neutral,
    outline: 'rgba(0, 0, 0, 0.12)',
  },
};

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
    GothicA1_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}>
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: colors.neutral },
            headerStyle: { backgroundColor: colors.neutral },
            headerTintColor: colors.textDark,
            headerTitleStyle: { fontFamily: 'GothicA1_700Bold' },
            headerShadowVisible: false,
            headerBackTitle: '',
            headerBackButtonDisplayMode: 'minimal',
            gestureEnabled: true,
            ...(isIOS ? { fullScreenGestureEnabled: true } : {}),
            animation: isAndroid ? 'slide_from_right' : undefined,
          }}
        >
          <Stack.Screen name="index" options={{ title: '', headerShown: false }} />

          <Stack.Screen
            name="signup"
            options={{
              title: '',
              gestureEnabled: true,
            }}
          />

          <Stack.Screen
            name="login"
            options={{
              title: '',
              gestureEnabled: true,
            }}
          />

          <Stack.Screen
            name="forgot-password"
            options={{
              title: '',
              gestureEnabled: true,
            }}
          />

          <Stack.Screen
            name="reset-password"
            options={{
              title: '',
              gestureEnabled: true,
            }}
          />

          <Stack.Screen
            name="dashboard"
            options={{
              title: '',
              headerShown: false,
              gestureEnabled: false,
            }}
          />

          <Stack.Screen
            name="add-patient"
            options={{
              title: '',
              headerBackTitle: '',
              gestureEnabled: true,
            }}
          />

          <Stack.Screen
            name="join-space"
            options={{
              title: 'Start Your Journey',
              headerShown: true,
              gestureEnabled: true,
            }}
          />

          <Stack.Screen
            name="join-patient"
            options={{
              title: 'Link to Patient',
              headerShown: true,
              gestureEnabled: true,
            }}
          />

          <Stack.Screen
            name="(patient-tabs)"
            options={{
              headerShown: false,
              gestureEnabled: false,
            }}
          />

          <Stack.Screen
            name="(caregiver-tabs)"
            options={{
              headerShown: false,
              title: '',
              gestureEnabled: false,
            }}
          />

          <Stack.Screen
            name="account"
            options={{
              title: 'Account',
              gestureEnabled: true,
            }}
          />

          <Stack.Screen
            name="patient-media"
            options={{
              title: 'Memories',
              headerShown: true,
              gestureEnabled: true,
              ...(isIOS ? { fullScreenGestureEnabled: true } : {}),
            }}
          />
        </Stack>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
