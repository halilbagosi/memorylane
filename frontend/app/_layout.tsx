import { Stack } from 'expo-router';
import { useFonts, DMSans_400Regular, DMSans_500Medium, DMSans_700Bold } from '@expo-google-fonts/dm-sans';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { colors } from '../src/theme/colors';

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
      <Stack
        screenOptions={{
          contentStyle: { backgroundColor: colors.neutral },
          headerStyle: { backgroundColor: colors.neutral },
          headerTintColor: colors.textDark,
          headerTitleStyle: { fontFamily: 'DMSans_700Bold' },
          headerShadowVisible: false,
          // Enable swipe-to-go-back on iOS by default
          gestureEnabled: true,
        }}
      >
        {/* Main role selection — no header, no back */}
        <Stack.Screen name="index" options={{ headerShown: false }} />

        {/* Signup — has a header back arrow that goes to index (role selection) */}
        <Stack.Screen
          name="signup"
          options={{
            title: 'Sign Up',
            gestureEnabled: true,
          }}
        />

        {/* Login — has a header back arrow, swipe-to-go-back enabled */}
        <Stack.Screen
          name="login"
          options={{
            title: 'Log In',
            gestureEnabled: true,
          }}
        />

        {/* Dashboard — no header, no back gesture (user should use logout) */}
        <Stack.Screen
          name="dashboard"
          options={{
            title: 'Dashboard',
            headerShown: false,
            gestureEnabled: false,
          }}
        />

        {/* Add Patient — header back arrow goes to dashboard, swipe enabled */}
        <Stack.Screen
          name="add-patient"
          options={{
            title: 'Add Patient',
            gestureEnabled: true,
          }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
