import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../src/theme/colors';
import { typography } from '../src/theme/typography';
import { API_BASE_URL } from '../src/config/api';
import { useRouter } from 'expo-router';
import { saveToken, saveCaregiverInfo } from '../src/utils/auth';
import { AdaptiveButton } from '../src/components/AdaptiveButton';
import { AdaptiveInput } from '../src/components/AdaptiveInput';
import { AppIcon } from '../src/components/AppIcon';

const isIOS = Platform.OS === 'ios';

interface PasswordStrength {
  score: number;       // 0-4
  label: string;
  color: string;
}

function evaluatePassword(pw: string): PasswordStrength {
  if (!pw) return { score: 0, label: '', color: 'transparent' };

  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;

  // Clamp to 4
  score = Math.min(score, 4);

  const levels: Record<number, { label: string; color: string }> = {
    0: { label: '', color: 'transparent' },
    1: { label: 'Weak', color: '#e74c3c' },
    2: { label: 'Fair', color: '#e67e22' },
    3: { label: 'Good', color: '#f1c40f' },
    4: { label: 'Strong', color: '#27ae60' },
  };

  return { score, ...levels[score] };
}

export default function SignupScreen() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [errors, setErrors] = useState<{ name?: string; surname?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const strength = useMemo(() => evaluatePassword(password), [password]);

  const handleNameChange = (text: string) => {
    if (/^[a-zA-Z\s]*$/.test(text)) {
      setName(text);
      setErrors(prev => ({ ...prev, name: undefined }));
    } else {
      setErrors(prev => ({ ...prev, name: 'Only letters and spaces are allowed.' }));
    }
  };

  const handleSurnameChange = (text: string) => {
    if (/^[a-zA-Z\s]*$/.test(text)) {
      setSurname(text);
      setErrors(prev => ({ ...prev, surname: undefined }));
    } else {
      setErrors(prev => ({ ...prev, surname: 'Only letters and spaces are allowed.' }));
    }
  };

  const handleSignup = async () => {
    if (!name.trim() || !surname.trim() || !email || !password) {
      setApiError('Please fill in all fields correctly.');
      return;
    }

    setIsLoading(true);
    setApiError('');

    try {
      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          surname: surname.trim(),
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const msg = Array.isArray(data.message) ? data.message.join('\n') : data.message;
        throw new Error(msg || 'Something went wrong during signup');
      }

      // Auto-login: store token + caregiver info and go straight to dashboard
      if (data.accessToken) {
        await saveToken(data.accessToken);
      }
      if (data.caregiver) {
        await saveCaregiverInfo(data.caregiver);
      }

      router.replace('/dashboard');
    } catch (error: any) {
      setApiError(error.message || 'Failed to connect to the backend');
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
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.headline}>Create Your Account</Text>
          <Text style={styles.subheadline}>Join MemoryLane as a caregiver.</Text>

          <AdaptiveInput
            label="First Name"
            value={name}
            onChangeText={handleNameChange}
            placeholder="Enter your first name"
            error={errors.name}
          />

          <AdaptiveInput
            label="Last Name"
            value={surname}
            onChangeText={handleSurnameChange}
            placeholder="Enter your last name"
            error={errors.surname}
          />

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
            placeholder="Min 8 chars, upper + lower + number"
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

          {/* Password strength indicator */}
          {password.length > 0 && (
            <View style={styles.strengthContainer}>
              <View style={styles.strengthBarTrack}>
                {[1, 2, 3, 4].map((segment) => (
                  <View
                    key={segment}
                    style={[
                      styles.strengthBarSegment,
                      {
                        backgroundColor: segment <= strength.score
                          ? strength.color
                          : isIOS ? 'rgba(0,0,0,0.06)' : '#E0E0E0',
                      },
                      isIOS ? styles.iosSegment : styles.androidSegment,
                    ]}
                  />
                ))}
              </View>
              {strength.label !== '' && (
                <Text style={[styles.strengthLabel, { color: strength.color }]}>
                  {strength.label}
                </Text>
              )}
            </View>
          )}

          {apiError ? <Text style={styles.apiErrorText}>{apiError}</Text> : null}

          <AdaptiveButton
            title="Sign Up"
            onPress={handleSignup}
            loading={isLoading}
            loadingText="Creating Account..."
            style={{ marginTop: 8 }}
          />

          <View style={styles.linkRow}>
            <Text style={styles.linkText}>Already have an account? </Text>
            <AdaptiveButton
              title="Log In"
              variant="ghost"
              onPress={() => router.push('/login')}
              style={styles.linkButton}
              textStyle={styles.linkBoldText}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.neutral,
  },
  container: { flex: 1 },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  headline: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 26,
    color: colors.textDark,
    marginBottom: 6,
    marginTop: 8,
  },
  subheadline: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 15,
    color: colors.textMuted,
    marginBottom: 28,
  },

  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -10,
    marginBottom: 18,
  },
  strengthBarTrack: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
    height: 5,
  },
  strengthBarSegment: {
    flex: 1,
    height: 5,
  },
  iosSegment: {
    borderRadius: 3,
  },
  androidSegment: {
    borderRadius: 2,
  },
  strengthLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    minWidth: 44,
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
