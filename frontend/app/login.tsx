import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { API_BASE_URL } from '../src/config/api';
import { useRouter } from 'expo-router';
import { saveToken, saveCaregiverInfo } from '../src/utils/auth';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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
      // 10-second timeout so we don't hang if backend is down
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${API_BASE_URL}/auth/login`, {
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

      // Store token + caregiver info securely
      await saveToken(data.accessToken);
      if (data.caregiver) {
        await saveCaregiverInfo(data.caregiver);
      }

      router.replace('/dashboard');
    } catch (error: any) {
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
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Top spacer — pushes form toward vertical center */}
          <View style={styles.topSpacer} />

          <Text style={styles.headline}>Welcome Back</Text>
          <Text style={styles.subheadline}>Sign in to your caregiver account.</Text>

          {/* Email */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="example@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          {/* Password with eye toggle */}
          <View style={styles.formGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={styles.passwordContainer}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={setPassword}
                placeholder="Enter your password"
                secureTextEntry={!showPassword}
                placeholderTextColor={colors.textMuted}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowPassword(!showPassword)}
              >
                <Text style={styles.eyeIcon}>{showPassword ? '👁️' : '👁️‍🗨️'}</Text>
              </TouchableOpacity>
            </View>
          </View>

          {apiError ? <Text style={styles.apiErrorText}>{apiError}</Text> : null}

          <TouchableOpacity
            style={[styles.primaryButton, isLoading && { opacity: 0.7 }]}
            onPress={handleLogin}
            activeOpacity={0.8}
            disabled={isLoading}
          >
            <Text style={styles.primaryButtonText}>{isLoading ? 'Signing In...' : 'Log In'}</Text>
          </TouchableOpacity>

          {/* Link to signup */}
          <TouchableOpacity onPress={() => router.push('/signup')} style={styles.linkRow}>
            <Text style={styles.linkText}>Don't have an account? </Text>
            <Text style={styles.linkTextBold}>Sign Up</Text>
          </TouchableOpacity>

          {/* Bottom spacer for proportional feel */}
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

  /* Proportional spacing — centers form in the screen */
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
  formGroup: { marginBottom: 18 },
  label: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textDark,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.neutralLight,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 14,
    padding: 16,
    fontFamily: typography.fontFamily.regular,
    fontSize: 16,
    color: colors.textDark,
  },
  apiErrorText: {
    color: '#e74c3c',
    fontFamily: typography.fontFamily.regular,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 12,
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutralLight,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 14,
    overflow: 'hidden',
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    fontFamily: typography.fontFamily.regular,
    fontSize: 16,
    color: colors.textDark,
  },
  eyeButton: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  eyeIcon: { fontSize: 20 },
  primaryButton: {
    backgroundColor: colors.secondary,
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: colors.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryButtonText: {
    color: colors.textLight,
    fontFamily: typography.fontFamily.bold,
    fontSize: 16,
  },
  linkRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  linkText: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: colors.textMuted },
  linkTextBold: { fontFamily: typography.fontFamily.bold, fontSize: 14, color: colors.secondary },
});
