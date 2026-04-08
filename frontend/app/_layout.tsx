import { Stack } from 'expo-router';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { View, Text, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider, MD3LightTheme } from 'react-native-paper';
import { registerTranslation, en } from 'react-native-paper-dates';
import { colors } from '../src/theme/colors';

registerTranslation('en', en);

const isAndroid = Platform.OS === 'android';

const paperTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: colors.secondary,
    primaryContainer: 'rgba(45, 79, 62, 0.12)',
    onPrimary: colors.textLight,
    onPrimaryContainer: colors.secondary,
    secondary: colors.primary,
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
  const [fontsLoaded] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: colors.neutral }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 16, color: colors.textMuted, fontSize: 16 }}>Loading MemoryLane...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <PaperProvider theme={paperTheme}>
        <Stack
          screenOptions={{
            contentStyle: { backgroundColor: colors.neutral },
            headerStyle: { backgroundColor: colors.neutral },
            headerTintColor: colors.textDark,
            headerTitleStyle: { fontFamily: 'DMSans_700Bold' },
            headerShadowVisible: false,
            headerBackTitle: '',
            gestureEnabled: true,
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
              headerTransparent: true,
              headerBlurEffect: 'systemMaterial',
            }}
          />

          <Stack.Screen
            name="join-patient"
            options={{
              title: 'Link to Patient',
              headerShown: true,
              gestureEnabled: true,
              headerTransparent: true,
              headerBlurEffect: 'systemMaterial',
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
        </Stack>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
