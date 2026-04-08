import React, { useState } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { API_BASE_URL } from '../src/config/api';
import { useRouter } from 'expo-router';
import { saveToken, saveCaregiverInfo } from '../src/utils/auth';
import { AdaptiveButton } from '../src/components/AdaptiveButton';
import { AdaptiveInput } from '../src/components/AdaptiveInput';
import { AppIcon } from '../src/components/AppIcon';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const isIOS = Platform.OS === 'ios';

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const handleLogin = async () => {
    if (!email || !password) {
      setApiError('Please enter your email and password.');
      return;
    }

    setIsLoading(true);
    setApiError('');

    try {
      const url = `${API_BASE_URL}/auth/login`;
      console.log('[LOGIN] Fetching:', url);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const data = await response.json();

      if (!response.ok) {
        const msg = Array.isArray(data.message) ? data.message.join('\n') : data.message;
        throw new Error(msg || 'Invalid credentials');
      }

      await saveToken(data.accessToken);
      if (data.caregiver) {
        await saveCaregiverInfo(data.caregiver);
      }

      router.replace('/dashboard');
    } catch (error: any) {
      console.log('[LOGIN] Error:', error.name, error.message);
      if (error.name === 'AbortError') {
        setApiError('Connection timed out. Is the backend running?');
      } else {
        setApiError(error.message || 'Failed to connect to the backend');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={isIOS ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.topSpacer} />

          <Text style={styles.headline}>Welcome Back</Text>
          <Text style={styles.subheadline}>Sign in to your caregiver account.</Text>

          <AdaptiveInput
            label="Email Address"
            value={email}
            onChangeText={setEmail}
            placeholder="example@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <AdaptiveInput
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Enter your password"
            secureTextEntry={!showPassword}
            suffix={{
              icon: (
                <AppIcon
                  iosName={showPassword ? 'eye.slash' : 'eye'}
                  androidFallback={showPassword ? 'Hide' : 'Show'}
                  size={20}
                  color={colors.textMuted}
                />
              ),
              onPress: () => setShowPassword(!showPassword),
            }}
          />

          {apiError ? <Text style={styles.apiErrorText}>{apiError}</Text> : null}

          <AdaptiveButton
            title="Log In"
            onPress={handleLogin}
            loading={isLoading}
            loadingText="Signing In..."
            style={{ marginTop: 8 }}
          />

          {/* Link to signup */}
          <View style={styles.linkRow}>
            <Text style={styles.linkText}>Don't have an account? </Text>
            <AdaptiveButton
              title="Sign Up"
              variant="ghost"
              onPress={() => router.push('/signup')}
              style={styles.linkButton}
              textStyle={styles.linkBoldText}
            />
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.neutral },
  container: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },

  topSpacer: {
    height: SCREEN_HEIGHT * 0.12,
  },
  bottomSpacer: {
    height: SCREEN_HEIGHT * 0.06,
  },

  headline: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 28,
    color: colors.textDark,
    marginBottom: 6,
    textAlign: 'center',
  },
  subheadline: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: colors.textMuted,
    marginBottom: SCREEN_HEIGHT * 0.04,
    textAlign: 'center',
  },
  apiErrorText: {
    color: '#e74c3c',
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 20,
  },
  linkText: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    color: colors.textMuted,
  },
  linkButton: {
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  linkBoldText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.secondary,
    textTransform: 'none',
    letterSpacing: 0,
  },
});
