import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, Platform,
  ScrollView, TouchableOpacity, Image, Alert, Linking,
} from 'react-native';
import * as Device from 'expo-device';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
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

  score = Math.min(score, 4);

  const levels: Record<number, { label: string; color: string }> = {
    0: { label: '', color: 'transparent' },
    1: { label: 'Weak', color: '#C0392B' },
    2: { label: 'Fair', color: '#e67e22' },
    3: { label: 'Good', color: '#f1c40f' },
    4: { label: 'Strong', color: '#27ae60' },
  };

  return { score, ...levels[score] };
}

export default function SignupScreen() {
  const router = useRouter();

  const [avatarBase64, setAvatarBase64] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [surname, setSurname] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  const strength = useMemo(() => evaluatePassword(password), [password]);

  const pickAvatar = async (source: 'camera' | 'library') => {
    let result: ImagePicker.ImagePickerResult;

    if (source === 'camera') {
      const { status, canAskAgain } = await ImagePicker.requestCameraPermissionsAsync();
      if (status !== 'granted') {
        if (!canAskAgain) {
          Alert.alert(
            'Camera Access Required',
            'Camera permission was denied. Please enable it in your device Settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
        } else {
          Alert.alert('Permission needed', 'Camera access is required to take a photo.');
        }
        return;
      }
      result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });
    } else {
      const { status, canAskAgain } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        if (!canAskAgain) {
          Alert.alert(
            'Photo Library Access Required',
            'Photo library permission was denied. Please enable it in your device Settings.',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Open Settings', onPress: () => Linking.openSettings() },
            ],
          );
        } else {
          Alert.alert('Permission needed', 'Photo library access is required.');
        }
        return;
      }
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });
    }

    if (result.canceled || !result.assets?.[0]?.base64) return;
    setAvatarBase64(result.assets[0].base64);
  };

  const showAvatarOptions = () => {
    Alert.alert('Profile Picture', 'Add a photo so your care team can recognise you', [
      { text: 'Take Photo', onPress: () => pickAvatar('camera') },
      { text: 'Choose from Library', onPress: () => pickAvatar('library') },
      ...(avatarBase64 ? [{ text: 'Remove Photo', style: 'destructive' as const, onPress: () => setAvatarBase64(null) }] : []),
      { text: 'Skip for Now', style: 'cancel' },
    ]);
  };

  const handleSignup = async () => {
    if (!name.trim() || !surname.trim() || !email || !password) {
      setApiError('Please fill in all fields correctly.');
      return;
    }

    setIsLoading(true);
    setApiError('');

    try {
      const avatarUrl = avatarBase64 ? `data:image/jpeg;base64,${avatarBase64}` : undefined;

      const response = await fetch(`${API_BASE_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          surname: surname.trim(),
          email,
          password,
          ...(avatarUrl ? { avatarUrl } : {}),
          deviceLabel: Device.modelName ?? undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        const msg = Array.isArray(data.message) ? data.message.join('\n') : data.message;
        throw new Error(msg || 'Something went wrong during signup');
      }

      if (data.accessToken) await saveToken(data.accessToken);
      if (data.caregiver) await saveCaregiverInfo(data.caregiver);

      router.replace('/dashboard');
    } catch (error: any) {
      setApiError(error.message || 'Failed to connect to the backend');
    } finally {
      setIsLoading(false);
    }
  };

  const avatarUri = avatarBase64 ? `data:image/jpeg;base64,${avatarBase64}` : null;
  const initials = `${name?.[0] ?? ''}${surname?.[0] ?? ''}`.toUpperCase();

  return (
    <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets={true}
        >
          <Text style={styles.headline}>Create Your Account</Text>
          <Text style={styles.subheadline}>Join MemoryLane as a caregiver.</Text>

          {/* Profile photo picker */}
          <View style={styles.avatarRow}>
            <TouchableOpacity onPress={showAvatarOptions} activeOpacity={0.8} style={styles.avatarWrapper}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.avatarCircle} />
              ) : (
                <View style={styles.avatarCircle}>
                  {initials ? (
                    <Text style={styles.avatarInitials}>{initials}</Text>
                  ) : (
                    <AppIcon iosName="person.crop.circle" androidFallback="👤" size={32} color="rgba(255,255,255,0.8)" />
                  )}
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                <AppIcon iosName="plus" androidFallback="+" size={11} color="#fff" weight="bold" />
              </View>
            </TouchableOpacity>
            <View style={styles.avatarHint}>
              <Text style={styles.avatarHintTitle}>Profile Photo</Text>
              <Text style={styles.avatarHintSub}>Optional — tap to add</Text>
            </View>
          </View>

          <AdaptiveInput
            label="First Name"
            onChangeText={setName}
            placeholder="Enter your first name"
          />

          <AdaptiveInput
            label="Last Name"
            onChangeText={setSurname}
            placeholder="Enter your last name"
          />

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.neutral },
  container: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 40 },

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

  // Avatar picker
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 28,
  },
  avatarWrapper: { position: 'relative' },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontFamily: typography.fontFamily.bold,
    fontSize: 24,
    color: colors.textLight,
    letterSpacing: 1,
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.secondary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: colors.neutral,
  },
  avatarHint: { flex: 1 },
  avatarHintTitle: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 15,
    color: colors.textDark,
    marginBottom: 3,
  },
  avatarHintSub: {
    fontFamily: typography.fontFamily.regular,
    fontSize: 13,
    color: colors.textMuted,
  },

  strengthContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: -10,
    marginBottom: 18,
  },
  strengthBarTrack: { flex: 1, flexDirection: 'row', gap: 4, height: 5 },
  strengthBarSegment: { flex: 1, height: 5 },
  iosSegment: { borderRadius: 3 },
  androidSegment: { borderRadius: 2 },
  strengthLabel: {
    fontFamily: typography.fontFamily.medium,
    fontSize: 12,
    minWidth: 44,
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
});
