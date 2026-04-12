import React, { useState } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Dimensions, TouchableOpacity,
} from 'react-native';
import * as Device from 'expo-device';
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

interface DeactivatedState {
  caregiverId: string;
  scheduledDeleteAt: string;
  daysLeft: number;
}

interface RestoredState {
  firstName: string;
  patients: { patientName: string; newPrimaryName: string }[];
}

export default function LoginScreen() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');
  const [deactivated, setDeactivated] = useState<DeactivatedState | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restored, setRestored] = useState<RestoredState | null>(null);

  const handleLogin = async () => {
    if (!email || !password) {
      setApiError('Please enter your email and password.');
      return;
    }

    setIsLoading(true);
    setApiError('');
    setDeactivated(null);

    try {
      const url = `${API_BASE_URL}/auth/login`;
      console.log('[LOGIN] Fetching:', url);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, deviceLabel: Device.modelName ?? undefined }),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const data = await response.json();

      // Special case: account is deactivated (soft-deleted, within grace period)
      if (response.ok && data.accountStatus === 'DEACTIVATED') {
        setDeactivated({
          caregiverId: data.caregiverId,
          scheduledDeleteAt: data.scheduledDeleteAt,
          daysLeft: data.daysLeft,
        });
        return;
      }

      if (!response.ok) {
        const msg = Array.isArray(data.message) ? data.message.join('\n') : data.message;
        throw new Error(msg || 'Invalid credentials');
      }

      await saveToken(data.accessToken);
      if (data.caregiver) await saveCaregiverInfo(data.caregiver);

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

  const handleRestore = async () => {
    if (!deactivated) return;
    setRestoring(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/restore-account`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caregiverId: deactivated.caregiverId }),
      });
      const data = await res.json();
      if (res.ok) {
        await saveToken(data.accessToken);
        if (data.caregiver) await saveCaregiverInfo(data.caregiver);

        if (data.roleChanged && data.roleChangedPatients?.length > 0) {
          // Show the "Welcome back" screen explaining secondary status
          setRestored({
            firstName: data.caregiver.name,
            patients: data.roleChangedPatients,
          });
        } else {
          router.replace('/dashboard');
        }
      } else {
        setApiError(data.message ?? 'Failed to restore account');
        setDeactivated(null);
      }
    } catch {
      setApiError('Failed to connect to the server');
    } finally {
      setRestoring(false);
    }
  };

  // ── Post-restore "Welcome back" screen ─────────────────────────────────────
  if (restored) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardAvoidingView behavior={isIOS ? 'padding' : 'height'} style={styles.container}>
          <ScrollView
            contentContainerStyle={[styles.scrollContent, { alignItems: 'center' }]}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.topSpacer} />

            <View style={styles.welcomeBackIconWrap}>
              <AppIcon iosName="checkmark.circle.fill" androidFallback="✓" size={48} color="#4A7A5A" />
            </View>

            <Text style={styles.restoreHeadline}>Welcome back,{'\n'}{restored.firstName}</Text>

            <Text style={styles.restoreSubheadline}>
              Your account has been restored. Since you finalized your handover, you are now a{' '}
              <Text style={{ fontFamily: typography.fontFamily.bold, color: colors.textDark }}>
                Secondary Caregiver
              </Text>
              {' '}for the following patients:
            </Text>

            <View style={{ width: '100%', marginTop: 16, gap: 10 }}>
              {restored.patients.map((p, i) => (
                <View key={i} style={styles.patientRoleCard}>
                  <Text style={styles.patientRoleName}>{p.patientName}</Text>
                  <Text style={styles.patientRolePrimary}>
                    Primary manager: {p.newPrimaryName}
                  </Text>
                </View>
              ))}
            </View>

            <Text style={[styles.restoreSubheadline, { marginTop: 16, fontSize: 13 }]}>
              You can still view and add media. To reclaim the primary role, ask the new primary to delegate it back to you from the Care Team settings.
            </Text>

            <AdaptiveButton
              title="Enter App"
              onPress={() => router.replace('/dashboard')}
              style={{ marginTop: 28, width: '100%' }}
            />

            <View style={styles.bottomSpacer} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Restore screen ──────────────────────────────────────────────────────────
  if (deactivated) {
    const deleteDate = new Date(deactivated.scheduledDeleteAt).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });

    return (
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <KeyboardAvoidingView behavior={isIOS ? 'padding' : 'height'} style={styles.container}>
            <ScrollView contentContainerStyle={[styles.scrollContent, { alignItems: 'center' }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled">
            <View style={styles.topSpacer} />

            <View style={styles.restoreIconWrap}>
              <AppIcon iosName="clock.badge.exclamationmark" androidFallback="⏰" size={48} color="#e67e22" />
            </View>

            <Text style={styles.restoreHeadline}>Account Scheduled{'\n'}for Deletion</Text>
            <Text style={styles.restoreSubheadline}>
              You requested to delete your account on this device. It will be permanently removed on{' '}
              <Text style={{ fontFamily: typography.fontFamily.bold, color: colors.textDark }}>{deleteDate}</Text>
              {` (${deactivated.daysLeft} day${deactivated.daysLeft !== 1 ? 's' : ''} remaining).`}
            </Text>
            <Text style={[styles.restoreSubheadline, { marginTop: 8, fontSize: 13 }]}>
              Your patients have been transferred to their new primary caregivers. If you restore your account, you will re-join as a secondary caregiver.
            </Text>

            <AdaptiveButton
              title="Restore My Account"
              onPress={handleRestore}
              loading={restoring}
              loadingText="Restoring..."
              style={{ marginTop: 28, width: '100%' }}
            />

            <TouchableOpacity style={{ marginTop: 16, paddingVertical: 10 }} onPress={() => setDeactivated(null)}>
              <Text style={styles.restoreBackText}>Back to Login</Text>
            </TouchableOpacity>

            <View style={styles.bottomSpacer} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ── Normal login screen ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
      <KeyboardAvoidingView behavior={isIOS ? 'padding' : 'height'} style={styles.container}>
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
            onChangeText={setEmail}
            placeholder="example@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <AdaptiveInput
            label="Password"
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

  topSpacer: { height: SCREEN_HEIGHT * 0.12 },
  bottomSpacer: { height: SCREEN_HEIGHT * 0.06 },

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
    color: '#C0392B',
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
  linkText: { fontFamily: typography.fontFamily.regular, fontSize: 14, color: colors.textMuted },
  linkButton: { paddingHorizontal: 0, paddingVertical: 0 },
  linkBoldText: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 14,
    color: colors.secondary,
    textTransform: 'none',
    letterSpacing: 0,
  },

  // Restore screen
  restoreIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(230,126,34,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  restoreHeadline: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 24,
    color: colors.textDark,
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 32,
  },
  restoreSubheadline: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  restoreBackText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textMuted,
  },

  // Welcome-back screen
  welcomeBackIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(74,122,90,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  patientRoleCard: {
    width: '100%',
    backgroundColor: colors.neutralLight,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  patientRoleName: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 15,
    color: colors.textDark,
  },
  patientRolePrimary: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 3,
  },
});
