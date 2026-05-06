import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Dimensions, TouchableOpacity
} from 'react-native';
import * as Device from 'expo-device';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { SafeAreaView } from 'react-native-safe-area-context';

let GoogleSignin: any = null;
let statusCodes: any = {};
try {
  const mod = require('@react-native-google-signin/google-signin');
  GoogleSignin = mod.GoogleSignin;
  statusCodes = mod.statusCodes;
} catch {
  // Native module unavailable (e.g. running in Expo Go)
}
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { API_BASE_URL } from '../src/config/api';
import { useRouter } from 'expo-router';
import { saveToken, saveCaregiverInfo } from '../src/utils/auth';
import { AdaptiveButton } from '../src/components/AdaptiveButton';
import { AdaptiveInput } from '../src/components/AdaptiveInput';
import { AppIcon } from '../src/components/AppIcon';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { M3Dialog, type M3DialogAction } from '../src/components/M3Dialog';

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
  const [isSocialLoading, setIsSocialLoading] = useState(false);
  const [googleConfigured, setGoogleConfigured] = useState(false);
  const [apiError, setApiError] = useState('');
  const [deactivated, setDeactivated] = useState<DeactivatedState | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [restored, setRestored] = useState<RestoredState | null>(null);

  const [dialog, setDialog] = useState<{
    visible: boolean;
    title: string;
    body: string;
    actions: M3DialogAction[];
  }>({ visible: false, title: '', body: '', actions: [] });

  const showDialog = (title: string, body: string, actions: M3DialogAction[]) => {
    setDialog({ visible: true, title, body, actions });
  };

  const dismissDialog = () => {
    setDialog((prev) => ({ ...prev, visible: false }));
  };

  useEffect(() => {
    if (!GoogleSignin) return;
    let mounted = true;
    (async () => {
      try {
        // On iOS, RNGoogleSignin requires either GoogleService-Info.plist
        // or an explicit iosClientId in configure().
        const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
        const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
        if (Platform.OS === 'ios' && !iosClientId) {
          if (mounted) setGoogleConfigured(false);
          return;
        }
        await GoogleSignin.configure({
          webClientId,
          iosClientId,
        });
        if (mounted) setGoogleConfigured(true);
      } catch {
        if (mounted) setGoogleConfigured(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSocialLogin = async (provider: 'google' | 'apple', idToken: string, fullName?: string) => {
    setIsSocialLoading(true);
    setApiError('');
    setDeactivated(null);

    try {
      const url = `${API_BASE_URL}/auth/social-login`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      const body: Record<string, string> = { provider, idToken };
      if (fullName) body.fullName = fullName;
      if (Device.modelName) body.deviceLabel = Device.modelName;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeout);
      const data = await response.json();

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
        throw new Error(msg || 'Social login failed');
      }

      await saveToken(data.accessToken);
      if (data.caregiver) await saveCaregiverInfo(data.caregiver);

      router.replace('/dashboard');
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setApiError('Connection timed out. Is the backend running?');
      } else {
        setApiError(error.message || 'Failed to connect to the backend');
      }
    } finally {
      setIsSocialLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!GoogleSignin || !googleConfigured) {
      showDialog(
        'Google Sign-In Unavailable',
        Platform.OS === 'ios'
          ? 'Google Sign-In is not configured for iOS yet. Add EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID or include GoogleService-Info.plist in the iOS build.'
          : 'Google Sign-In is not available in this build yet. Rebuild the app after configuring Google auth.',
        [{ label: 'OK', onPress: dismissDialog }],
      );
      return;
    }

    try {
      await GoogleSignin.hasPlayServices();
      await GoogleSignin.signIn();
      const tokenResponse = await GoogleSignin.getTokens();
      if (tokenResponse.idToken) {
        await handleSocialLogin('google', tokenResponse.idToken);
      } else {
        setApiError('Could not retrieve Google ID token.');
      }
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        return;
      } else if (error.code === statusCodes.IN_PROGRESS) {
        return;
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        setApiError('Google Play Services are not available on this device.');
      } else {
        setApiError('Google sign-in failed. Please try again.');
      }
    }
  };

  const handleAppleSignIn = async () => {
    try {
      const nonce = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        Crypto.getRandomBytes(32).toString(),
      );

      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce,
      });

      if (!credential.identityToken) {
        setApiError('Could not retrieve Apple identity token.');
        return;
      }

      let fullName: string | undefined;
      if (credential.fullName?.givenName) {
        fullName = [credential.fullName.givenName, credential.fullName.familyName]
          .filter(Boolean)
          .join(' ');
      }

      await handleSocialLogin('apple', credential.identityToken, fullName);
    } catch (error: any) {
      if (error.code === 'ERR_REQUEST_CANCELED') {
        return;
      }
      setApiError('Apple sign-in failed. Please try again.');
    }
  };

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
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      // Omit deviceLabel by default: older deployed APIs reject it (forbidNonWhitelisted).
      // After redeploying a backend whose LoginDto includes deviceLabel, set in .env.local:
      // EXPO_PUBLIC_INCLUDE_LOGIN_DEVICE_LABEL=true
      const includeDeviceLabel = process.env.EXPO_PUBLIC_INCLUDE_LOGIN_DEVICE_LABEL === 'true';
      const loginBody: Record<string, string> = { email, password };
      if (includeDeviceLabel && Device.modelName) {
        loginBody.deviceLabel = Device.modelName;
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginBody),
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

          <TouchableOpacity
            onPress={() => router.push('/forgot-password')}
            style={{ alignSelf: 'flex-end', marginBottom: 4 }}
          >
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          <AdaptiveButton
            title="Log In"
            onPress={handleLogin}
            loading={isLoading}
            loadingText="Signing In..."
            style={{ marginTop: 8 }}
          />

          <View style={styles.separatorRow}>
            <View style={styles.separatorLine} />
            <Text style={styles.separatorText}>or continue with</Text>
            <View style={styles.separatorLine} />
          </View>

          <View style={styles.socialButtonsContainer}>
            {isIOS && (
              <TouchableOpacity
                style={styles.appleButton}
                onPress={handleAppleSignIn}
                activeOpacity={0.8}
                disabled={isSocialLoading}
              >
                <MaterialCommunityIcons name="apple" size={24} color="#FFF" />
                <Text style={styles.appleButtonText}>Continue with Apple</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignIn}
              activeOpacity={0.8}
              disabled={isSocialLoading || !GoogleSignin || !googleConfigured}
            >
              <MaterialCommunityIcons name="google" size={24} color="#333" />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </TouchableOpacity>
          </View>

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

      <M3Dialog
        visible={dialog.visible}
        title={dialog.title}
        body={dialog.body}
        actions={dialog.actions}
        onDismiss={dismissDialog}
      />
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
  forgotPasswordText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 13,
    color: colors.secondary,
  },
  separatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 24,
  },
  separatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  separatorText: {
    marginHorizontal: 16,
    fontFamily: typography.fontFamily.medium,
    fontSize: 14,
    color: colors.textMuted,
  },
  socialButtonsContainer: {
    gap: 12,
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000000',
    paddingVertical: 14,
    borderRadius: isIOS ? 20 : 28,
  },
  appleButtonText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 16,
    color: '#FFFFFF',
    marginLeft: 8,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 14,
    borderRadius: isIOS ? 20 : 28,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.1)',
  },
  googleButtonText: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 16,
    color: '#333333',
    marginLeft: 8,
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
