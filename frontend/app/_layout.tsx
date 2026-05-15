import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { GothicA1_700Bold } from '@expo-google-fonts/gothic-a1';
import * as SplashScreen from 'expo-splash-screen';
import { Platform, StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { registerTranslation, en } from 'react-native-paper-dates';
import { colors } from '../src/theme/colors';
import { ThemeProvider, useTheme } from '../src/theme/ThemeProvider';

registerTranslation('en', en);

SplashScreen.preventAutoHideAsync().catch(() => {
  /* already hidden or unavailable in some environments */
});

const isAndroid = Platform.OS === 'android';
const isIOS = Platform.OS === 'ios';

function RootLayoutContent() {
  const { isDark, colors: themeColors } = useTheme();
  
  const paperTheme = {
    ...MD3LightTheme,
    colors: {
      ...MD3LightTheme.colors,
      primary: themeColors.primary,
      primaryContainer: isDark ? 'rgba(30, 77, 48, 0.24)' : 'rgba(30, 77, 48, 0.12)',
      onPrimary: themeColors.textLight,
      onPrimaryContainer: themeColors.primary,
      secondary: themeColors.secondary,
      secondaryContainer: isDark ? 'rgba(180, 174, 232, 0.25)' : 'rgba(180, 174, 232, 0.18)',
      surface: themeColors.neutral,
      surfaceVariant: themeColors.neutralLight,
      onSurface: themeColors.textDark,
      onSurfaceVariant: themeColors.textMuted,
      background: themeColors.neutral,
      outline: isDark ? 'rgba(235, 247, 239, 0.12)' : 'rgba(0, 0, 0, 0.12)',
    },
  };

  const currentBackgroundColor = themeColors.neutral;
  const currentTextColor = themeColors.textDark;

  return (
    <SafeAreaProvider>
      {isAndroid && (
        <StatusBar
          barStyle={isDark ? "light-content" : "dark-content"}
          backgroundColor={currentBackgroundColor}
          translucent={false}
        />
      )}
      <PaperProvider theme={paperTheme}>
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: currentBackgroundColor },
            headerStyle: { backgroundColor: currentBackgroundColor },
            headerTintColor: currentTextColor,
            headerTitleStyle: { fontFamily: 'GothicA1_700Bold', color: currentTextColor },
            headerShadowVisible: false,
            headerBackTitle: '',
            headerBackButtonDisplayMode: 'minimal',
            gestureEnabled: true,
            ...(isIOS ? { fullScreenGestureEnabled: true } : {}),
            animation: isAndroid ? 'slide_from_right' : undefined,
          }}
        >
          <Stack.Screen name="index" options={{ title: '', headerShown: false }} />
          <Stack.Screen name="signup" options={{ title: '', gestureEnabled: true }} />
          <Stack.Screen name="login" options={{ title: '', gestureEnabled: true }} />
          <Stack.Screen name="forgot-password" options={{ title: '', gestureEnabled: true }} />
          <Stack.Screen name="reset-password" options={{ title: '', gestureEnabled: true }} />
          <Stack.Screen name="dashboard" options={{ title: '', headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="add-patient" options={{ title: '', headerBackTitle: '', gestureEnabled: true }} />
          <Stack.Screen name="join-space" options={{ title: 'Start Your Journey', headerShown: true, gestureEnabled: true }} />
          <Stack.Screen name="join-patient" options={{ title: 'Link to Patient', headerShown: true, gestureEnabled: true }} />
          <Stack.Screen name="(patient-tabs)" options={{ headerShown: false, gestureEnabled: false }} />
          <Stack.Screen name="(caregiver-tabs)" options={{ headerShown: false, title: '', gestureEnabled: false }} />
          <Stack.Screen name="account" options={{ title: 'Account', gestureEnabled: true }} />
          <Stack.Screen name="patient-media" options={{ title: 'Memories', headerShown: true, gestureEnabled: true, ...(isIOS ? { fullScreenGestureEnabled: true } : {}) }} />
        </Stack>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

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
    <ThemeProvider>
      <RootLayoutContent />
    </ThemeProvider>
  );
}
